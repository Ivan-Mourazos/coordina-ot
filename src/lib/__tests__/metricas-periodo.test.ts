import { describe, expect, it } from "vitest";
import { calcularMetricas, mesDePeriodo, periodoAnterior, periodoDeMes, sinActividad, ventanaDeDias } from "../metricas";

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

describe("por mes", () => {
  it("el mes en curso va del día 1 a hoy; uno pasado, entero", () => {
    expect(periodoDeMes("2026-10", "2026-10-16")).toEqual({ desde: "2026-10-01", hasta: "2026-10-16" });
    expect(periodoDeMes("2026-09", "2026-10-16")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(periodoDeMes("2028-02", "2028-06-01")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
  });

  it("reconoce cuándo un periodo es un mes y cuándo un tramo libre", () => {
    expect(mesDePeriodo("2026-10-01", "2026-10-16", "2026-10-16")).toBe("2026-10");
    expect(mesDePeriodo("2026-09-01", "2026-09-30", "2026-10-16")).toBe("2026-09");
    expect(mesDePeriodo("2026-09-01", "2026-09-20", "2026-10-16")).toBeNull();
    expect(mesDePeriodo("", "", "2026-10-16")).toBeNull();
  });

  it("el mes en curso se compara con los MISMOS días del anterior", () => {
    // El 1-16 de octubre contra septiembre entero siempre saldría a la baja,
    // y no por trabajar menos: por tener la mitad de días.
    expect(periodoAnterior("2026-10-01", "2026-10-16")).toEqual({ desde: "2026-09-01", hasta: "2026-09-16" });
    // Y si el anterior es más corto, hasta su último día.
    expect(periodoAnterior("2026-03-01", "2026-03-30")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
  });

  it("un mes cerrado se compara con el anterior entero, aunque tengan distintos días", () => {
    expect(periodoAnterior("2026-10-01", "2026-10-31")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(periodoAnterior("2026-03-01", "2026-03-31")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
  });
});

describe("un periodo anterior sin registro", () => {
  // El de antes de julio de 2026: la web aún no apuntaba nada. Comparar contra
  // él pintaba "▲ 399 vs. el periodo anterior", un salto que no existió.
  it("sin un solo movimiento no hay con qué comparar", () => {
    expect(sinActividad(calcularMetricas([]))).toBe(true);
  });

  it("con un solo planteo ya es un periodo de verdad", () => {
    const m = calcularMetricas([
      { at: "2026-08-03T10:00:00.000Z", motivo: "terminar_planteo", ofId: "of1", observacion: null },
    ]);
    expect(sinActividad(m)).toBe(false);
  });
});
