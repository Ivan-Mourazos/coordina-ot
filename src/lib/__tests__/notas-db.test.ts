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
  estado.getDb().prepare("DELETE FROM nota_pedido").run();
});

test("una nota se guarda y se lee", () => {
  const creada = db.crearNota("AR.26.03914", "jaime", "falta el color", "2026-08-24T09:00:00.000Z");
  expect(creada.pedido).toBe("AR.26.03914");
  expect(creada.operarioId).toBe("jaime");
  expect(creada.texto).toBe("falta el color");
  expect(creada.editadoAt).toBeNull();
  expect(db.leerNotas("AR.26.03914")).toEqual([creada]);
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

test("las notas recientes salen de la más nueva a la más vieja", () => {
  // Al revés que el hilo de un pedido, que va como una conversación: la campana
  // enseña primero lo último que ha pasado.
  db.crearNota("AR.1", "jaime", "vieja", "2026-08-20T09:00:00.000Z");
  db.crearNota("AR.2", "ivan", "nueva", "2026-08-24T09:00:00.000Z");
  const r = db.leerNotasRecientes(30, new Date("2026-08-24T12:00:00.000Z"));
  expect(r.map((n) => n.texto)).toEqual(["nueva", "vieja"]);
});

test("una nota vieja se queda fuera de la ventana", () => {
  // Sin esto la campana arrastraría notas de hace meses, que ya no son noticia.
  db.crearNota("AR.1", "jaime", "de hace tiempo", "2026-06-01T09:00:00.000Z");
  expect(db.leerNotasRecientes(30, new Date("2026-08-24T12:00:00.000Z"))).toEqual([]);
});

test("una nota borrada no vuelve por la campana", () => {
  const n = db.crearNota("AR.1", "jaime", "fuera", "2026-08-24T09:00:00.000Z");
  db.borrarNota(n.id, "jaime", "2026-08-24T10:00:00.000Z");
  expect(db.leerNotasRecientes(30, new Date("2026-08-24T12:00:00.000Z"))).toEqual([]);
});
