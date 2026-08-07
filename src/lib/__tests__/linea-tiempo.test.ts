import { describe, expect, it } from "vitest";
import { lineaTiempo } from "../linea-tiempo";

const p = (solicitud: string, planificacion: string, entrega: string) => ({
  fechaSolicitud: solicitud,
  fechaPlanificacion: planificacion,
  fechaEntrega: entrega,
});

describe("lineaTiempo", () => {
  it("reparte las fechas a escala real, no a intervalos iguales", () => {
    // La fabricación cae al 25 % del recorrido: 10 días de 40.
    const l = lineaTiempo(p("2026-08-01", "2026-08-11", "2026-09-10"), "2026-08-01");
    expect(l.hitos.map((h) => Math.round(h.pct))).toEqual([0, 25, 100]);
    // "Plantear", no "Fabricación": `fechaPlanificacion` es el día en que OT
    // debe plantear, que es lo que ordena su lista de trabajo.
    expect(l.hitos.map((h) => h.etiqueta)).toEqual(["Entrada", "Plantear", "Entrega"]);
  });

  it("sitúa hoy donde toca", () => {
    const l = lineaTiempo(p("2026-08-01", "2026-08-11", "2026-08-21"), "2026-08-11");
    expect(Math.round(l.hoyPct)).toBe(50);
    expect(l.hoyFuera).toBe(false);
    expect(l.diasParaEntrega).toBe(10);
  });

  it("con la entrega pasada, hoy se queda en el extremo y se marca fuera", () => {
    const l = lineaTiempo(p("2026-08-01", "2026-08-05", "2026-08-10"), "2026-08-20");
    expect(l.hoyPct).toBe(100);
    expect(l.hoyFuera).toBe(true);
    expect(l.diasParaEntrega).toBe(-10);
  });

  it("con un pedido que aún no ha entrado, hoy se queda al principio", () => {
    const l = lineaTiempo(p("2026-08-10", "2026-08-15", "2026-08-20"), "2026-08-01");
    expect(l.hoyPct).toBe(0);
    expect(l.hoyFuera).toBe(true);
  });

  it("si las tres fechas son el mismo día no revienta: reparte iguales", () => {
    // Sin recorrido no hay escala posible; la línea tiene que seguir siendo
    // legible en vez de amontonar los tres hitos en el mismo punto.
    const l = lineaTiempo(p("2026-08-05", "2026-08-05", "2026-08-05"), "2026-08-05");
    expect(l.hitos.map((h) => h.pct)).toEqual([0, 50, 100]);
    expect(l.diasParaEntrega).toBe(0);
  });

  it("aguanta fechas desordenadas (entrega antes que la entrada)", () => {
    const l = lineaTiempo(p("2026-08-20", "2026-08-15", "2026-08-10"), "2026-08-12");
    expect(l.hitos.every((h) => Number.isFinite(h.pct))).toBe(true);
    expect(l.hoyPct).toBeGreaterThanOrEqual(0);
    expect(l.hoyPct).toBeLessThanOrEqual(100);
  });
});

describe("con fecha de fabricación", () => {
  it("añade el hito entre plantear y entregar, a escala", () => {
    const l = lineaTiempo(
      {
        ...p("2026-08-01", "2026-08-05", "2026-08-21"),
        fechaFabricacion: "2026-08-11",
      },
      "2026-08-01",
    );
    expect(l.hitos.map((h) => h.etiqueta)).toEqual([
      "Entrada",
      "Plantear",
      "Fabricación",
      "Entrega",
    ]);
    expect(l.hitos.map((h) => Math.round(h.pct))).toEqual([0, 20, 50, 100]);
  });

  it("sin ella, la línea sigue teniendo tres hitos", () => {
    const l = lineaTiempo(p("2026-08-01", "2026-08-05", "2026-08-21"), "2026-08-01");
    expect(l.hitos).toHaveLength(3);
    expect(l.hitos[1].etiqueta).toBe("Plantear");
  });
});
