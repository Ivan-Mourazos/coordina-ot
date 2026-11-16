import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let db: typeof import("../server/notas-db");
let estado: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-notas-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  estado = await import("../server/estado-db");
  db = await import("../server/notas-db");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

beforeEach(() => {
  estado.getDb().exec("DELETE FROM nota_audiencia; DELETE FROM nota_mencion; DELETE FROM nota_pedido;");
});

test("una nota se guarda y se lee", () => {
  const creada = db.crearNota("AR.26.03914", "jaime", "falta el color", "2026-08-24T09:00:00.000Z");
  expect(creada.pedido).toBe("AR.26.03914");
  expect(creada.operarioId).toBe("jaime");
  expect(creada.texto).toBe("falta el color");
  expect(creada.editadoAt).toBeNull();
  // Al leer, la nota trae además el nombre de quien la escribió (de persona).
  expect(db.leerNotas("AR.26.03914")).toEqual([{ ...creada, autor: "Jaime Vázquez" }]);
  expect(creada).toMatchObject({ para: [], menciones: [], enConsultaPublica: false });
});

test("el hilo sale de la más vieja a la más nueva: se lee como una conversación", () => {
  // La SEGUNDA que se inserta lleva una fecha ANTERIOR, así que su id es mayor
  // pero su creado_at menor. Si se ordenara por id (o por orden de inserción)
  // saldría al revés: así el test distingue de verdad por qué columna ordena.
  db.crearNota("AR.1", "jaime", "segunda", "2026-08-24T10:00:00.000Z");
  db.crearNota("AR.1", "ivan", "primera", "2026-08-24T09:00:00.000Z");
  expect(db.leerNotas("AR.1").map((n) => n.texto)).toEqual(["primera", "segunda"]);
});

test("cada pedido tiene su hilo", () => {
  db.crearNota("AR.1", "jaime", "la del uno", "2026-08-24T09:00:00.000Z");
  db.crearNota("AR.2", "jaime", "la del dos", "2026-08-24T09:00:00.000Z");
  expect(db.leerNotas("AR.1").map((n) => n.texto)).toEqual(["la del uno"]);
  expect(db.leerNotas("AR.2").map((n) => n.texto)).toEqual(["la del dos"]);
});

test("un pedido sin notas devuelve lista vacía, no revienta", () => {
  expect(db.leerNotas("AR.NO.EXISTE")).toEqual([]);
});

test("el código sintético de una OF suelta vale como clave", () => {
  db.crearNota("OF 0231158", "jaime", "ojo con esta", "2026-08-24T09:00:00.000Z");
  expect(db.leerNotas("OF 0231158")).toHaveLength(1);
});

test("editas la tuya y queda marcada como editada", () => {
  const n = db.crearNota("AR.1", "jaime", "antes", "2026-08-24T09:00:00.000Z");
  expect(db.editarNota(n.id, "jaime", "después", "2026-08-24T11:00:00.000Z")).toBe(true);
  const [leida] = db.leerNotas("AR.1");
  expect(leida.texto).toBe("después");
  expect(leida.editadoAt).toBe("2026-08-24T11:00:00.000Z");
});

test("NO puedes editar la de otro", () => {
  const n = db.crearNota("AR.1", "jaime", "mía", "2026-08-24T09:00:00.000Z");
  expect(db.editarNota(n.id, "ivan", "te la cambio", "2026-08-24T11:00:00.000Z")).toBe(false);
  expect(db.leerNotas("AR.1")[0].texto).toBe("mía");
});

test("borrar la tuya la saca del hilo", () => {
  const n = db.crearNota("AR.1", "jaime", "fuera", "2026-08-24T09:00:00.000Z");
  expect(db.borrarNota(n.id, "jaime", "2026-08-24T11:00:00.000Z")).toBe(true);
  expect(db.leerNotas("AR.1")).toEqual([]);
});

test("el borrado es BLANDO: la fila sigue ahí para poder recuperarla", () => {
  const n = db.crearNota("AR.1", "jaime", "fuera", "2026-08-24T09:00:00.000Z");
  db.borrarNota(n.id, "jaime", "2026-08-24T11:00:00.000Z");
  const fila = estado
    .getDb()
    .prepare("SELECT texto, borrado_at FROM nota_pedido WHERE id = ?")
    .get(n.id) as { texto: string; borrado_at: string | null };
  expect(fila.texto).toBe("fuera");
  expect(fila.borrado_at).toBe("2026-08-24T11:00:00.000Z");
});

test("NO puedes borrar la de otro", () => {
  const n = db.crearNota("AR.1", "jaime", "mía", "2026-08-24T09:00:00.000Z");
  expect(db.borrarNota(n.id, "ivan", "2026-08-24T11:00:00.000Z")).toBe(false);
  expect(db.leerNotas("AR.1")).toHaveLength(1);
});

test("una nota ya borrada no se puede editar ni volver a borrar", () => {
  const n = db.crearNota("AR.1", "jaime", "fuera", "2026-08-24T09:00:00.000Z");
  db.borrarNota(n.id, "jaime", "2026-08-24T11:00:00.000Z");
  expect(db.editarNota(n.id, "jaime", "vuelvo", "2026-08-24T12:00:00.000Z")).toBe(false);
  expect(db.borrarNota(n.id, "jaime", "2026-08-24T12:00:00.000Z")).toBe(false);
});

test("editar o borrar una nota que no existe devuelve false, no revienta", () => {
  expect(db.editarNota(9999, "jaime", "hola", "2026-08-24T09:00:00.000Z")).toBe(false);
  expect(db.borrarNota(9999, "jaime", "2026-08-24T09:00:00.000Z")).toBe(false);
});

// ─── Consulta pública ────────────────────────────────────────────────────────

test("por defecto una nota no sale en la consulta pública", () => {
  const n = db.crearNota("AR.1", "jaime", "interna", "2026-10-19T09:00:00.000Z");
  expect(n.enConsultaPublica).toBe(false);
  expect(db.leerNotas("AR.1")[0].enConsultaPublica).toBe(false);
  expect(db.leerNotasPublicas("AR.1")).toEqual([]);
});

test("las marcadas salen en la consulta, con el nombre de quien la escribió", () => {
  estado.getDb().prepare("INSERT OR IGNORE INTO persona (id, nombre, roles, activo) VALUES ('prueba-notas', 'Pepe Prueba', 'tecnico', 1)").run();
  db.crearNota("AR.1", "jaime", "interna", "2026-10-19T09:00:00.000Z");
  db.crearNota("AR.1", "prueba-notas", "sale el jueves", "2026-10-19T10:00:00.000Z", { enConsultaPublica: true });
  db.crearNota("AR.2", "jaime", "otra", "2026-10-19T10:00:00.000Z", { enConsultaPublica: true });
  expect(db.leerNotasPublicas("AR.1")).toEqual([
    { texto: "sale el jueves", autor: "Pepe Prueba", creadoAt: "2026-10-19T10:00:00.000Z", editadoAt: null },
  ]);
});

test("el autor puede cambiar si sale en la consulta; otro no", () => {
  const n = db.crearNota("AR.1", "jaime", "texto", "2026-10-19T09:00:00.000Z");
  expect(db.editarNota(n.id, "ivan", "texto", "2026-10-19T10:00:00.000Z", { enConsultaPublica: true })).toBe(false);
  expect(db.editarNota(n.id, "jaime", "texto", "2026-10-19T10:00:00.000Z", { enConsultaPublica: true })).toBe(true);
  expect(db.leerNotas("AR.1")[0].enConsultaPublica).toBe(true);
  // Sin decir nada, se queda como estaba.
  expect(db.editarNota(n.id, "jaime", "otro texto", "2026-10-19T11:00:00.000Z")).toBe(true);
  expect(db.leerNotas("AR.1")[0].enConsultaPublica).toBe(true);
});

test("cuántas notas de la consulta tiene cada pedido, sin las borradas ni las restringidas", () => {
  db.crearNota("AR.1", "jaime", "a", "2026-10-19T09:00:00.000Z", { enConsultaPublica: true });
  const b = db.crearNota("AR.1", "jaime", "b", "2026-10-19T09:00:00.000Z", { enConsultaPublica: true });
  db.crearNota("AR.2", "jaime", "no marcada", "2026-10-19T09:00:00.000Z");
  db.crearNota("AR.3", "jaime", "restringida", "2026-10-19T09:00:00.000Z", {
    para: [{ tipo: "seccion", id: "ot" }],
    enConsultaPublica: true,
  });
  db.borrarNota(b.id, "jaime", "2026-10-19T10:00:00.000Z");
  expect(db.contarNotasPublicas(["AR.1", "AR.2", "AR.3"])).toEqual(new Map([["AR.1", 1]]));
});

// ─── Audiencia, menciones y avisos (16/11/2026) ─────────────────────────────

const T = "2026-11-16T09:00:00.000Z";
const AHORA = new Date(T);
const ivan = { id: "ivan", destinos: ["persona:ivan", "seccion:ot", "seccion:direccion"] };
const belen = { id: "belen-alamancos", destinos: ["persona:belen-alamancos", "seccion:produccion"] };
const carron = { id: "carron", destinos: ["persona:carron", "seccion:diseno"] };

test("para todos la ve cualquiera; restringida solo su público y el autor", () => {
  db.crearNota("AR.1", "ivan", "general", T, { para: [], enConsultaPublica: false });
  db.crearNota("AR.1", "ivan", "solo prod", T, { para: [{ tipo: "seccion", id: "produccion" }], enConsultaPublica: false });
  expect(db.leerNotas("AR.1", belen).map((n) => n.texto)).toEqual(["general", "solo prod"]);
  expect(db.leerNotas("AR.1", carron).map((n) => n.texto)).toEqual(["general"]);
  expect(db.leerNotas("AR.1", ivan).map((n) => n.texto)).toEqual(["general", "solo prod"]);
  expect(db.leerNotas("AR.1", ivan)[1].para).toEqual([{ tipo: "seccion", id: "produccion" }]);
});

test("restringida a una persona: la ve ella y el autor, nadie más", () => {
  const n = db.crearNota("AR.1", "carron", "para Belén", T, { para: [{ tipo: "persona", id: "belen-alamancos" }] });
  expect(db.puedeVer(n.id, belen)).toBe(true);
  expect(db.puedeVer(n.id, ivan)).toBe(false);
  expect(db.puedeVer(n.id, carron)).toBe(true);
  // Sin login no hay filtro, como hasta ahora.
  expect(db.puedeVer(n.id, null)).toBe(true);
});

test("restringida nunca sale en la consulta pública, aunque se marque", () => {
  const n = db.crearNota("AR.1", "ivan", "x", T, { para: [{ tipo: "seccion", id: "ot" }], enConsultaPublica: true });
  expect(n.enConsultaPublica).toBe(false);
  const m = db.crearNota("AR.1", "ivan", "y", T, { enConsultaPublica: true });
  db.editarNota(m.id, "ivan", "y", T, { para: [{ tipo: "seccion", id: "ot" }] });
  expect(db.leerNotas("AR.1")[1].enConsultaPublica).toBe(false);
});

test("avisa por mención, por público restringido, nunca al autor ni a nadie si no hay nada", () => {
  db.crearNota("AR.2", "carron", "nota suelta", T, { para: [], enConsultaPublica: false });
  db.crearNota("AR.2", "carron", "mira @[persona:ivan]", T, { para: [], enConsultaPublica: false });
  db.crearNota("AR.2", "carron", "para prod", T, { para: [{ tipo: "seccion", id: "produccion" }], enConsultaPublica: false });
  db.crearNota("AR.2", "carron", "ojo @[seccion:ot]", T, { para: [], enConsultaPublica: false });
  expect(db.leerAvisosNotas(ivan, 30, AHORA).map((n) => n.texto).sort()).toEqual(["mira @[persona:ivan]", "ojo @[seccion:ot]"]);
  expect(db.leerAvisosNotas(belen, 30, AHORA).map((n) => n.texto)).toEqual(["para prod"]);
  expect(db.leerAvisosNotas(carron, 30, AHORA)).toEqual([]);
});

test("Dirección no recibe @Oficina Técnica si no es de OT", () => {
  const esteban = { id: "esteban", destinos: ["persona:esteban", "seccion:direccion"] };
  db.crearNota("AR.3", "carron", "ojo @[seccion:ot]", T, { para: [], enConsultaPublica: false });
  expect(db.leerAvisosNotas(esteban, 30, AHORA)).toEqual([]);
});

test("una mención en una nota que no puedes ver no te avisa", () => {
  db.crearNota("AR.3", "ivan", "ojo @[persona:carron]", T, { para: [{ tipo: "seccion", id: "ot" }] });
  expect(db.leerAvisosNotas(carron, 30, AHORA)).toEqual([]);
});

test("editar solo avisa de las menciones nuevas", () => {
  const n = db.crearNota("AR.4", "carron", "hola @[persona:ivan]", T, { para: [], enConsultaPublica: false });
  const despues = new Date(AHORA.getTime() + 60_000);
  db.editarNota(n.id, "carron", "hola @[persona:ivan] @[seccion:produccion]", despues.toISOString());
  const fila = estado.getDb().prepare("SELECT creado_at FROM nota_mencion WHERE nota_id = ? AND destino = 'ivan'").get(n.id);
  expect(fila).toEqual({ creado_at: T });
  const avisos = db.leerAvisosNotas(belen, 30, despues);
  expect(avisos.map((x) => x.id)).toEqual([n.id]);
  expect(avisos[0].avisoAt).toBe(despues.toISOString());
  expect(avisos[0].menciones).toEqual([
    { tipo: "persona", id: "ivan" },
    { tipo: "seccion", id: "produccion" },
  ]);
});

test("una mención quitada al editar deja de avisar", () => {
  const n = db.crearNota("AR.4", "carron", "hola @[persona:ivan]", T);
  db.editarNota(n.id, "carron", "hola", T);
  expect(db.leerAvisosNotas(ivan, 30, AHORA)).toEqual([]);
});

test("las notas viejas sin fecha de público no avisan", () => {
  const n = db.crearNota("AR.5", "carron", "interna de antes", T);
  estado.getDb().prepare("INSERT INTO nota_audiencia (nota_id, tipo, destino, creado_at) VALUES (?, 'seccion', 'ot', NULL)").run(n.id);
  expect(db.leerNotas("AR.5", ivan)).toHaveLength(1);
  expect(db.leerAvisosNotas(ivan, 30, AHORA)).toEqual([]);
});

test("los avisos caducan con la ventana y las borradas no avisan", () => {
  db.crearNota("AR.6", "carron", "vieja @[persona:ivan]", "2026-09-01T09:00:00.000Z");
  const b = db.crearNota("AR.6", "carron", "borrada @[persona:ivan]", T);
  db.borrarNota(b.id, "carron", T);
  expect(db.leerAvisosNotas(ivan, 30, AHORA)).toEqual([]);
});

test("consulta pública: solo marcadas y sin restricción", () => {
  db.crearNota("AR.5", "ivan", "pública", T, { para: [], enConsultaPublica: true });
  db.crearNota("AR.5", "ivan", "no marcada", T, { para: [], enConsultaPublica: false });
  db.crearNota("AR.5", "ivan", "restringida", T, { para: [{ tipo: "seccion", id: "ot" }], enConsultaPublica: true });
  expect(db.leerNotasPublicas("AR.5").map((n) => n.texto)).toEqual(["pública"]);
});
