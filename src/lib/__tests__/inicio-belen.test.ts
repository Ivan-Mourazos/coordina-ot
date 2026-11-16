import { expect, test } from "vitest";
import { enGrupos, GRUPOS_BELEN, HERRAMIENTAS_BELEN, ordenarGrupos, ordenarHerramientas } from "../herramientas-belen";

test("los bloques salen en el orden guardado y los que faltan van al final", () => {
  const grupos = ordenarGrupos(["tiempos", "fechas", "no-existe"]);
  expect(grupos.map((g) => g.id)).toEqual(["tiempos", "fechas", "pedidos", "bultos", "material", "datos"]);
  expect(enGrupos(HERRAMIENTAS_BELEN, grupos).map((g) => g.id)).toEqual(grupos.map((g) => g.id));
  expect(ordenarGrupos(null)).toEqual(GRUPOS_BELEN);
});

test("respeta el orden elegido, descarta duplicados y añade herramientas nuevas", () => {
  const r = ordenarHerramientas(["sin-descripcion", "entregas", "sin-descripcion", "retirada", 42]);
  expect(r.slice(0, 2).map((h) => h.id)).toEqual(["sin-descripcion", "entregas"]);
  expect(new Set(r.map((h) => h.id)).size).toBe(HERRAMIENTAS_BELEN.length);
  expect(r).toHaveLength(HERRAMIENTAS_BELEN.length);
});

test("sin preferencias válidas se muestran todas las herramientas", () => {
  for (const valor of [null, {}, "roto", []]) expect(ordenarHerramientas(valor)).toEqual(HERRAMIENTAS_BELEN);
});
