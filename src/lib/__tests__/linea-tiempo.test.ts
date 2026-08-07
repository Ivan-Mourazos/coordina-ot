import { describe, expect, it } from "vitest";
import { lineaTiempo } from "../linea-tiempo";

// Vocabulario de la herramienta vieja, que es el del taller:
//   creación      = cuándo entró el pedido (OrderDate)
//   planificación = el día de PLANTEAR (FechaPlanificada de la vista)
//   fabricación   = fin de fabricación previsto (PlannedEndDate de la OF)
//   solicitada    = la ENTREGA que pide el cliente (FechaSolicitada)
const p = (creacion: string, planificacion: string, entrega: string) => ({
  fechaCreacion: creacion,
  fechaPlanificacion: planificacion,
  fechaEntrega: entrega,
});

describe("lineaTiempo", () => {
  it("reparte las fechas a escala real, no a intervalos iguales", () => {
    // La planificación cae al 25 % del recorrido: 10 días de 40.
    const l = lineaTiempo(p("2026-08-01", "2026-08-11", "2026-09-10"), "2026-08-01");
    expect(l.hitos.map((h) => Math.round(h.pct))).toEqual([0, 25, 100]);
    expect(l.hitos.map((h) => h.etiqueta)).toEqual([
      "Creación",
      "Planificación",
      "Solicitada",
    ]);
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

  it("aguanta fechas desordenadas (entrega antes que la creación)", () => {
    const l = lineaTiempo(p("2026-08-20", "2026-08-15", "2026-08-10"), "2026-08-12");
    expect(l.hitos.every((h) => Number.isFinite(h.pct))).toBe(true);
    expect(l.hoyPct).toBeGreaterThanOrEqual(0);
    expect(l.hoyPct).toBeLessThanOrEqual(100);
  });

  it("sin fecha de creación arranca en la planificación, sin inventarse la entrada", () => {
    const l = lineaTiempo(
      { fechaPlanificacion: "2026-08-05", fechaEntrega: "2026-08-25" },
      "2026-08-05",
    );
    expect(l.hitos.map((h) => h.etiqueta)).toEqual(["Planificación", "Solicitada"]);
    expect(l.hitos[0].pct).toBe(0);
  });
});

describe("con fecha de fabricación", () => {
  it("añade el hito entre planificación y solicitada, a escala", () => {
    const l = lineaTiempo(
      {
        ...p("2026-08-01", "2026-08-05", "2026-08-21"),
        fechaFabricacion: "2026-08-11",
      },
      "2026-08-01",
    );
    expect(l.hitos.map((h) => h.etiqueta)).toEqual([
      "Creación",
      "Planificación",
      "Fabricación",
      "Solicitada",
    ]);
    expect(l.hitos.map((h) => Math.round(h.pct))).toEqual([0, 20, 50, 100]);
  });

  it("sin ella, la línea sigue teniendo tres hitos", () => {
    const l = lineaTiempo(p("2026-08-01", "2026-08-05", "2026-08-21"), "2026-08-01");
    expect(l.hitos).toHaveLength(3);
    expect(l.hitos[1].etiqueta).toBe("Planificación");
  });

  it("con la fabricación después de la solicitada, la escala la marca la fabricación", () => {
    // Pasa de verdad en RPS: un pedido que va tarde. El hito no puede salirse
    // de la línea, así que el extremo derecho es la fecha más tardía.
    const l = lineaTiempo(
      {
        ...p("2026-08-01", "2026-08-05", "2026-08-21"),
        fechaFabricacion: "2026-08-31",
      },
      "2026-08-01",
    );
    const pcts = Object.fromEntries(l.hitos.map((h) => [h.clave, Math.round(h.pct)]));
    expect(pcts.fabricacion).toBe(100);
    expect(pcts.solicitada).toBe(67);
    expect(l.hitos.every((h) => h.pct >= 0 && h.pct <= 100)).toBe(true);
  });
});
