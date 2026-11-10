import { expect, test } from "vitest";
import { HERRAMIENTAS_BELEN, ordenarHerramientas } from "../herramientas-belen";

test("respeta el orden elegido, descarta duplicados y añade herramientas nuevas", () => {
  const r = ordenarHerramientas(["sin-descripcion", "entregas", "sin-descripcion", "retirada", 42]);
  expect(r.slice(0, 2).map((h) => h.id)).toEqual(["sin-descripcion", "entregas"]);
  expect(new Set(r.map((h) => h.id)).size).toBe(HERRAMIENTAS_BELEN.length);
  expect(r).toHaveLength(HERRAMIENTAS_BELEN.length);
});

test("sin preferencias válidas se muestran todas las herramientas", () => {
  for (const valor of [null, {}, "roto", []]) expect(ordenarHerramientas(valor)).toEqual(HERRAMIENTAS_BELEN);
});
