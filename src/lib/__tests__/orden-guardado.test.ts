import { describe, expect, test } from "vitest";
import { moverA, ordenarPorIds } from "../orden-guardado";

const BASE = [{ id: "resumen" }, { id: "documentos" }, { id: "material" }, { id: "notas" }];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("orden guardado", () => {
  test("sin nada guardado, el de siempre", () => {
    expect(ids(ordenarPorIds(BASE, null))).toEqual(["resumen", "documentos", "material", "notas"]);
    expect(ids(ordenarPorIds(BASE, "roto"))).toEqual(["resumen", "documentos", "material", "notas"]);
  });
  test("lo guardado manda; lo nuevo al final y lo que ya no existe se ignora", () => {
    expect(ids(ordenarPorIds(BASE, ["notas", "vieja", "material", "notas"]))).toEqual(["notas", "material", "resumen", "documentos"]);
  });
  test("mover a una posición", () => {
    expect(ids(moverA(BASE, "notas", 0))).toEqual(["notas", "resumen", "documentos", "material"]);
    expect(ids(moverA(BASE, "resumen", 2))).toEqual(["documentos", "material", "resumen", "notas"]);
    expect(ids(moverA(BASE, "resumen", 9))).toEqual(ids(BASE));
  });
});
