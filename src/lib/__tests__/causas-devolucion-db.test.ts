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

test("la lista nace con las genéricas primero y las de lona detrás", () => {
  // Con la lista vacía el primer día, quien devuelve no entiende qué se le
  // pide y tira de la nota libre, que es de lo que se venía.
  //
  // El orden es el que ve el revisor: primero lo que se mira en cualquier
  // trabajo y luego lo propio de la familia, cada bloque en el orden del
  // repaso. Alfabético no valía — el repaso tiene un orden y no es ese.
  expect(db.leerCausasDevolucion().map((c) => c.etiqueta)).toEqual([
    "Error en medidas",
    "Error en cotas",
    "Material equivocado",
    "Medidas de la lona mal",
    "Medidas de los aumentos mal",
    "Tipo de lona equivocado",
    "Faltan anotaciones de material",
    "Faltan elementos",
    "Faltan piezas en el corte",
    "Medidas de corte no corresponden",
    "Falta la simetría",
  ]);
});

test("las de Ángel son de LONA; las genéricas no tienen familia", () => {
  // Las suyas hablan de aumentos, simetría y corte: en una funda no pintan
  // nada. Las genéricas salen en todos los trabajos, incluidos aquellos para
  // los que nadie ha dictado las suyas todavía.
  const porEtiqueta = new Map(db.leerCausasDevolucion().map((c) => [c.etiqueta, c]));
  expect(porEtiqueta.get("Falta la simetría")?.familia).toBe("LONA");
  expect(porEtiqueta.get("Error en medidas")?.familia).toBeNull();
});

test("cada punto de la guía trae su cara en positivo", () => {
  // Sin `mira` la causa se puede marcar al devolver, pero no es un punto que
  // repasar y no sale en la guía. Las sembradas son todas puntos.
  for (const c of db.leerCausasDevolucion()) {
    expect(c.mira, `${c.etiqueta} debería decir qué se comprueba`).toBeTruthy();
  }
});

test("las tres de relleno vuelven al servicio, y con su id de siempre", () => {
  // Se retiraron cuando llegaron las de Ángel porque competían con ellas;
  // ahora que hay familias son las genéricas y no compiten. Vuelven con su
  // id, que es lo que hace que la devolución de agosto marcada con "Error en
  // medidas" siga diciendo de qué fue.
  const todas = db.leerCausasDevolucion(true);
  for (const vieja of ["Error en cotas", "Error en medidas", "Material equivocado"]) {
    const c = todas.find((x) => x.etiqueta === vieja);
    expect(c, `${vieja} debería seguir existiendo`).toBeDefined();
    expect(c!.retirada).toBe(false);
    expect(c!.familia).toBeNull();
  }
});

test("editar una causa cambia SU fila, sin crear otra", () => {
  // Las devoluciones guardan el id: duplicarla al corregirle una palabra
  // partiría en dos el histórico de un mismo fallo.
  const antes = db.leerCausasDevolucion().find((c) => c.etiqueta === "Tipo de lona equivocado")!;
  const despues = db.editarCausaDevolucion(antes.id, {
    etiqueta: "Tipo de lona que no es",
    mira: "El tipo de lona",
  });
  expect(despues?.id).toBe(antes.id);
  expect(despues?.etiqueta).toBe("Tipo de lona que no es");
  // Y la clave se rehace, que es lo que sigue evitando los duplicados.
  expect(db.crearCausaDevolucion("  tipo de LONA que no es ", null).id).toBe(antes.id);
  // Se deja como estaba para no ensuciar los tests de abajo.
  db.editarCausaDevolucion(antes.id, { etiqueta: "Tipo de lona equivocado" });
});

test("no se puede editar una causa para que diga lo que ya dice otra", () => {
  // Si se dejara, dos filas contarían el mismo fallo por separado y las
  // métricas dejarían de decir nada.
  const causas = db.leerCausasDevolucion();
  const simetria = causas.find((c) => c.etiqueta === "Falta la simetría")!;
  expect(db.editarCausaDevolucion(simetria.id, { etiqueta: "faltan ELEMENTOS" })).toBeNull();
  // Y la suya no ha cambiado.
  expect(
    db.leerCausasDevolucion().find((c) => c.id === simetria.id)?.etiqueta,
  ).toBe("Falta la simetría");
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
