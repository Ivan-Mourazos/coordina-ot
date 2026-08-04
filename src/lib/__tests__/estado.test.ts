import { describe, expect, it } from "vitest";
import { fmtMin } from "../estado";

describe("fmtMin", () => {
  it("redondea los minutos fraccionarios de un fichaje en curso", () => {
    // Los minutos en vivo se derivan de milisegundos, así que llegan con
    // decimales. Sin redondear se imprimía "1.4525333333333332m" en pantalla.
    expect(fmtMin(1.4525333333333332)).toBe("1m");
    expect(fmtMin(0.5166666666666)).toBe("1m");
  });

  it("por debajo de medio minuto no inventa tiempo", () => {
    expect(fmtMin(0.2)).toBe("0h");
  });

  it("horas y minutos", () => {
    expect(fmtMin(60)).toBe("1h");
    expect(fmtMin(72)).toBe("1h 12m");
    expect(fmtMin(45)).toBe("45m");
  });

  it("cero y ausencia de tiempo", () => {
    expect(fmtMin(0)).toBe("0h");
  });

  it("un valor fraccionario que cruza la hora no descuadra", () => {
    expect(fmtMin(119.6)).toBe("2h");
  });
});
