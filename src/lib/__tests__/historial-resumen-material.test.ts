import { describe, expect, it } from "vitest";
import { resumenMaterial } from "../historial";

describe("resumenMaterial", () => {
  it("sin material no dice nada", () => {
    expect(resumenMaterial(undefined)).toBeNull();
    expect(resumenMaterial([])).toBeNull();
  });

  it("cuenta las líneas y cuántas siguen reservadas", () => {
    const r = resumenMaterial([
      { texto: "LONA PVC 650 · 12", apartado: true },
      { texto: "CINTA 50 · 4", apartado: false },
      { texto: "OLLAOS · 40", apartado: false },
    ]);
    expect(r?.texto).toBe("3 materiales · 1 reservado");
    expect(r?.titulo).toBe("LONA PVC 650 · 12 (reservado)\nCINTA 50 · 4\nOLLAOS · 40");
  });

  it("en singular y sin reservas no lo menciona", () => {
    expect(resumenMaterial([{ texto: "LONA · 3", apartado: false }])?.texto).toBe("1 material");
  });
});
