import { describe, expect, it } from "vitest";
import { esLaborable, minutosLaborables } from "../horario-laboral";

// Noviembre 2026 es horario de invierno: Madrid = UTC+1. 7:00 Madrid = 06:00Z.
describe("minutosLaborables", () => {
  it("dentro del mismo turno cuenta a reloj", () => {
    expect(minutosLaborables("2026-11-23T08:00:00Z", "2026-11-23T09:30:00Z")).toBe(90);
  });

  it("viernes a última hora → lunes a primera solo cuenta lo de dentro del turno", () => {
    // Viernes 20/11 13:50Z = 14:50 Madrid; lunes 23/11 07:10Z = 8:10 Madrid.
    expect(minutosLaborables("2026-11-20T13:50:00Z", "2026-11-23T07:10:00Z")).toBe(10 + 70);
  });

  it("la noche entre dos días no cuenta", () => {
    // Lunes 14:00 Madrid → martes 8:00 Madrid: 60 + 60.
    expect(minutosLaborables("2026-11-23T13:00:00Z", "2026-11-24T07:00:00Z")).toBe(120);
  });

  it("todo fuera de turno da cero", () => {
    expect(minutosLaborables("2026-11-21T09:00:00Z", "2026-11-22T12:00:00Z")).toBe(0); // fin de semana
    expect(minutosLaborables("2026-11-23T15:00:00Z", "2026-11-23T20:00:00Z")).toBe(0); // tarde
  });

  it("festivos y días de cierre no cuentan", () => {
    expect(esLaborable("2026-12-08")).toBe(false);
    expect(esLaborable("2026-12-07")).toBe(false);
    expect(esLaborable("2026-12-24")).toBe(false);
    expect(esLaborable("2026-12-09")).toBe(true);
    // Viernes 4/12 14:00 Madrid → miércoles 9/12 8:00 Madrid: 60 + 60 (7 y 8 cerrados).
    expect(minutosLaborables("2026-12-04T13:00:00Z", "2026-12-09T07:00:00Z")).toBe(120);
  });

  it("usa la hora de Madrid también en verano (UTC+2)", () => {
    // 7:00 Madrid en agosto = 05:00Z.
    expect(minutosLaborables("2026-08-03T04:00:00Z", "2026-08-03T06:00:00Z")).toBe(60);
  });

  it("lo fichado fuera de turno cuenta, sin contar dos veces lo que se solapa", () => {
    // Lunes 14:00 → martes 8:00 Madrid. Fichó de 14:30 a 17:00 y otro a la vez
    // de 16:00 a 16:30: 60 de turno + 120 fuera (15:00-17:00) + 60 del martes.
    const fichado = [
      { inicio: "2026-11-23T13:30:00Z", fin: "2026-11-23T16:00:00Z" },
      { inicio: "2026-11-23T15:00:00Z", fin: "2026-11-23T15:30:00Z" },
      { inicio: "2026-11-23T18:00:00Z" }, // abierto: no cuenta
    ];
    expect(minutosLaborables("2026-11-23T13:00:00Z", "2026-11-24T07:00:00Z", fichado)).toBe(240);
    // Un sábado fichado también.
    expect(minutosLaborables("2026-11-21T09:00:00Z", "2026-11-21T12:00:00Z",
      [{ inicio: "2026-11-21T10:00:00Z", fin: "2026-11-21T11:00:00Z" }])).toBe(60);
  });

  it("un rango al revés da NaN, como la resta", () => {
    expect(minutosLaborables("2026-11-23T09:00:00Z", "2026-11-23T08:00:00Z")).toBeNaN();
  });
});
