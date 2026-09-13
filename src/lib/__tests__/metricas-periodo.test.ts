import { describe, expect, it } from "vitest";
import { periodoAnterior, ventanaDeDias } from "../metricas";

// Un número solo no dice nada: un 33 % de devueltas puede ser una mejora o un
// desastre según cómo viniera el trimestre anterior. Estas dos funciones son
// las que sujetan la comparación, y el error clásico —ventanas de distinta
// longitud— haría que la flecha mintiera sin que se note.

describe("la ventana por defecto", () => {
  it("son los últimos N días, con hoy dentro", () => {
    // 90 días contando hoy: del 14 de junio al 12 de septiembre, los dos
    // incluidos. Si `desde` fuera hoy menos 90, serían 91 días.
    expect(ventanaDeDias(90, "2026-09-12")).toEqual({
      desde: "2026-06-15",
      hasta: "2026-09-12",
    });
  });

  it("una ventana de un día es hoy", () => {
    expect(ventanaDeDias(1, "2026-09-12")).toEqual({
      desde: "2026-09-12",
      hasta: "2026-09-12",
    });
  });
});

describe("el periodo anterior", () => {
  it("tiene la MISMA longitud y acaba justo antes", () => {
    // Comparar 90 días con 30 haría que el periodo corto pareciera siempre
    // mejor, y no por trabajar mejor: por tener menos días dentro.
    expect(periodoAnterior("2026-06-15", "2026-09-12")).toEqual({
      desde: "2026-03-17",
      hasta: "2026-06-14",
    });
  });

  it("de un solo día, el día de antes", () => {
    expect(periodoAnterior("2026-09-12", "2026-09-12")).toEqual({
      desde: "2026-09-11",
      hasta: "2026-09-11",
    });
  });

  it("cruza el cambio de año sin perder un día", () => {
    // Enero entero son 31 días, así que el anterior son los 31 que acaban el
    // 31 de diciembre: diciembre entero.
    expect(periodoAnterior("2026-01-01", "2026-01-31")).toEqual({
      desde: "2025-12-01",
      hasta: "2025-12-31",
    });
  });

  it("sin periodo no hay periodo anterior: nada con que comparar", () => {
    expect(periodoAnterior("", "")).toBeNull();
    expect(periodoAnterior("2026-09-01", "")).toBeNull();
  });
});
