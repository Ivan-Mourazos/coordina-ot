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

test("la lista nace con las causas que dictó Ángel", () => {
  // Con la lista vacía el primer día, quien devuelve no entiende qué se le
  // pide y tira de la nota libre, que es de lo que se venía. Van en el orden
  // en que las lee `leerCausasDevolucion` (alfabético), no en el que se
  // siembran: es el que ve el revisor.
  expect(db.leerCausasDevolucion().map((c) => c.etiqueta)).toEqual([
    "Falta la simetría",
    "Faltan anotaciones de material",
    "Faltan elementos",
    "Faltan piezas en el corte",
    "Medidas de corte no corresponden",
    "Medidas de la lona mal",
    "Medidas de los aumentos mal",
    "Tipo de lona equivocado",
  ]);
});

test("las tres de relleno quedan retiradas, no borradas", () => {
  // Borrarlas dejaría sin causa a la devolución de agosto que apunta a "Error
  // en medidas": el histórico tiene que seguir diciendo de qué fue.
  const todas = db.leerCausasDevolucion(true);
  for (const vieja of ["Error en cotas", "Error en medidas", "Material equivocado"]) {
    const c = todas.find((x) => x.etiqueta === vieja);
    expect(c, `${vieja} debería seguir existiendo`).toBeDefined();
    expect(c!.retirada).toBe(true);
  }
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
