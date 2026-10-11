import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let db: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-causas-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  db = await import("../server/estado-db");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

test("una base nueva nace con las seis causas globales", () => {
  // Con la lista vacía el primer día, quien devuelve no entiende qué se le
  // pide y tira de la nota libre. Desde la migración 12 son pocas y comunes;
  // lo detallado vive en los pasos de revisión.
  expect(db.leerCausasDevolucion().map((c) => c.etiqueta)).toEqual([
    "Medidas",
    "Documentación incompleta",
    "Material y acabados",
    "Corte",
    "Elementos y accesorios",
    "Modelo y colocación",
  ]);
  expect(db.leerCausasDevolucion().every((c) => c.familia === null)).toBe(true);
});

test("lo que dictó Ángel para las lonas sigue como pasos de lona, cada uno con su causa", () => {
  const causa = new Map(db.leerCausasDevolucion().map((c) => [c.etiqueta, c.id]));
  const pasos = db.leerPasosRevision();
  const de = (texto: string) => pasos.find((p) => p.texto === texto);
  expect(de("Medidas de la lona hecha")).toMatchObject({ familia: "LONA", causaId: causa.get("Medidas") });
  expect(de("Simetría hecha, si hace falta")).toMatchObject({ familia: "LONA", causaId: causa.get("Corte") });
  expect(de("Están todos los elementos")?.causaId).toBe(causa.get("Elementos y accesorios"));
  // Los comunes van delante de los de familia.
  expect(pasos[0].familia).toBeNull();
});

test("las causas de lona de antes se retiran, pero siguen existiendo", () => {
  // Las devoluciones viejas las nombran por id: tienen que poder leerse.
  const vieja = db.leerCausasDevolucion(true).find((c) => c.etiqueta === "Falta la simetría");
  expect(vieja?.retirada).toBe(true);
});

test("editar una causa cambia SU fila, sin crear otra", () => {
  // Las devoluciones guardan el id: duplicarla al corregirle una palabra
  // partiría en dos el histórico de un mismo fallo.
  const antes = db.leerCausasDevolucion().find((c) => c.etiqueta === "Corte")!;
  const despues = db.editarCausaDevolucion(antes.id, { etiqueta: "Corte y despiece" });
  expect(despues?.id).toBe(antes.id);
  expect(despues?.etiqueta).toBe("Corte y despiece");
  // Y la clave se rehace, que es lo que sigue evitando los duplicados.
  expect(db.crearCausaDevolucion("  corte Y DESPIECE ", null).id).toBe(antes.id);
  // Se deja como estaba para no ensuciar los tests de abajo.
  db.editarCausaDevolucion(antes.id, { etiqueta: "Corte" });
});

test("no se puede editar una causa para que diga lo que ya dice otra", () => {
  // Si se dejara, dos filas contarían el mismo fallo por separado y las
  // métricas dejarían de decir nada.
  const causas = db.leerCausasDevolucion();
  const corte = causas.find((c) => c.etiqueta === "Corte")!;
  expect(db.editarCausaDevolucion(corte.id, { etiqueta: "MEDIDAS" })).toBeNull();
  // Y la suya no ha cambiado.
  expect(db.leerCausasDevolucion().find((c) => c.id === corte.id)?.etiqueta).toBe("Corte");
});

test("crear la misma causa dos veces devuelve la MISMA, no dos", () => {
  // El caso de verdad: dos revisores la crean con segundos de diferencia y
  // escrita distinta. Si salieran dos filas, las métricas contarían el mismo
  // fallo por separado, que es justo lo que se quiere evitar.
  const a = db.crearCausaDevolucion("Falta el croquis", "tamara");
  const b = db.crearCausaDevolucion("  falta EL croquis  ", "angel");
  expect(b.id).toBe(a.id);
  expect(db.leerCausasDevolucion().filter((c) => /croquis/i.test(c.etiqueta))).toHaveLength(1);
  // Manda la primera: la segunda no reescribe el rótulo de la que ya se estaba
  // usando.
  expect(b.etiqueta).toBe("Falta el croquis");
});

test("una causa retirada deja de ofrecerse, pero se sigue pudiendo leer", () => {
  const c = db.crearCausaDevolucion("Se anuló el pedido", "angel");
  expect(db.retirarCausaDevolucion(c.id, true)).toBe(true);

  // Fuera de la lista que se ofrece al devolver…
  expect(db.leerCausasDevolucion().map((x) => x.id)).not.toContain(c.id);
  // …pero sigue existiendo, que es lo que permite pintar las devoluciones que
  // la usaron. Borrarla las dejaría apuntando a la nada.
  const todas = db.leerCausasDevolucion(true);
  expect(todas.find((x) => x.id === c.id)?.retirada).toBe(true);
});

test("volver a crear una retirada la reactiva, sin duplicarla", () => {
  // Alguien la necesita otra vez. Crear una gemela partiría el histórico en
  // dos: la mitad de las devoluciones en un id y la mitad en el otro.
  const c = db.crearCausaDevolucion("Se anuló el pedido", "tamara");
  expect(c.retirada).toBe(false);
  expect(db.leerCausasDevolucion().filter((x) => /anuló/i.test(x.etiqueta))).toHaveLength(1);
});

test("lo comprobado se guarda por OF y se borra al cerrar la revisión", () => {
  // Sin guardarlo, un refresco a media revisión obligaría a repasar los ocho
  // puntos otra vez para poder aprobar. Y sin borrarlo al cerrar, la segunda
  // vuelta de una OF empezaría con los ✓ de la primera: dar por mirado lo que
  // nadie ha vuelto a mirar.
  const causa = db.leerCausasDevolucion()[0];

  db.marcarPuntoRevision(["of-1", "of-2"], causa.id, "bien", "tamara");
  expect(db.leerMarcasRevision(["of-1"])["of-1"][causa.id]).toBe("bien");
  expect(db.leerMarcasRevision(["of-2"])["of-2"][causa.id]).toBe("bien");

  // Desmarcar borra la fila: "sin mirar" no es un estado que guardar.
  db.marcarPuntoRevision(["of-2"], causa.id, null, "tamara");
  expect(db.leerMarcasRevision(["of-2"])["of-2"]).toBeUndefined();

  // Y aprobar cierra la revisión de esa OF.
  db.guardarMutacion({
    operarioId: "tamara",
    motivo: "aprobar",
    cambiosOF: [
      { ofId: "of-1", autorId: "alberto", revisorId: "tamara", estado: "aprobada", observacion: null },
    ],
  });
  expect(db.leerMarcasRevision(["of-1"])["of-1"]).toBeUndefined();
});

test("marcar en varias OF a la vez, que es como se revisa un pedido", () => {
  // La guía es del PEDIDO: se mira el trabajo entero y se marca una sola
  // lista, aunque el pedido traiga cuatro OF.
  const causa = db.leerCausasDevolucion()[1];
  db.marcarPuntoRevision(["a", "b", "c"], causa.id, "falla", "angel");
  const marcas = db.leerMarcasRevision(["a", "b", "c"]);
  expect(Object.keys(marcas).sort()).toEqual(["a", "b", "c"]);
  expect(marcas.a[causa.id]).toBe("falla");
});
