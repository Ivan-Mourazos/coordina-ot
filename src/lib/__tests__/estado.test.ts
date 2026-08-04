import { describe, expect, it } from "vitest";
import { fmtMin } from "../estado";

describe("fmtMin", () => {
  it("muestra los segundos de un fichaje recién empezado", () => {
    // Sin segundos esto salía como "0h", que parece que no corre nada.
    expect(fmtMin(0.75)).toBe("45s");
    expect(fmtMin(0.2)).toBe("12s");
  });

  it("minutos y segundos cuando los hay", () => {
    // 6,9 min = 6 min 54 s.
    expect(fmtMin(6.9)).toBe("6m 54s");
  });

  it("omite los segundos cuando son cero: los tiempos estimados se leen limpios", () => {
    expect(fmtMin(115)).toBe("1h 55m");
    expect(fmtMin(45)).toBe("45m");
    expect(fmtMin(60)).toBe("1h");
    expect(fmtMin(120)).toBe("2h");
  });

  it("las tres unidades a la vez", () => {
    expect(fmtMin(125.5)).toBe("2h 5m 30s");
  });

  it("redondea a segundos en vez de imprimir el crudo", () => {
    // Antes salía "1.4525333333333332m" en pantalla.
    expect(fmtMin(1.4525333333333332)).toBe("1m 27s");
  });

  it("sin tiempo", () => {
    expect(fmtMin(0)).toBe("0m");
    expect(fmtMin(-5)).toBe("0m");
  });
});
