import { describe, expect, it } from "vitest";
import { ACCIONES, accionesDisponibles, aplicarAccion } from "../acciones";
import type { OF } from "../types";

const of = (estado: OF["estado"], extra: Partial<OF> = {}): OF => ({
  id: "of1", codigo: "OF-01", descripcion: "x", familia: "TOLDO", piezas: 1,
  autorId: "op1", revisorId: "op2", estado, fichandoRol: null,
  tiempoEstimadoMin: 0, tiempoPlanteoMin: 0, tiempoRevisionMin: 0, ...extra,
});

describe("accionesDisponibles", () => {
  it("pendiente con autor: empezar planteo y anular", () => {
    expect(accionesDisponibles(of("pendiente")).map((a) => a.id))
      .toEqual(["empezar_planteo", "anular"]);
  });
  it("pendiente sin autor: solo anular (empezar requiere autor)", () => {
    expect(accionesDisponibles(of("pendiente", { autorId: null })).map((a) => a.id))
      .toEqual(["anular"]);
  });
  it("por_revisar sin revisor no ofrece empezar revisión", () => {
    expect(accionesDisponibles(of("por_revisar", { revisorId: null })).map((a) => a.id))
      .toEqual(["anular"]);
  });
  it("anulada ofrece restaurar; aprobada ofrece reabrir", () => {
    expect(accionesDisponibles(of("anulada")).map((a) => a.id)).toEqual(["restaurar"]);
    expect(accionesDisponibles(of("aprobada")).map((a) => a.id)).toEqual(["reabrir"]);
  });
});

describe("aplicarAccion", () => {
  it("transiciones básicas", () => {
    expect(aplicarAccion(of("pendiente"), "empezar_planteo").estado).toBe("en_curso");
    expect(aplicarAccion(of("en_curso"), "terminar_planteo").estado).toBe("por_revisar");
    expect(aplicarAccion(of("en_revision"), "aprobar").estado).toBe("aprobada");
    expect(aplicarAccion(of("devuelta"), "retomar").estado).toBe("en_curso");
    expect(aplicarAccion(of("anulada"), "restaurar").estado).toBe("pendiente");
  });
  it("devolver exige nota y la guarda", () => {
    const r = aplicarAccion(of("en_revision"), "devolver", "falta cota");
    expect(r.estado).toBe("devuelta");
    expect(r.observacion).toBe("falta cota");
    expect(() => aplicarAccion(of("en_revision"), "devolver", "  ")).toThrow();
  });
  it("acción no disponible desde ese estado lanza error", () => {
    expect(() => aplicarAccion(of("aprobada"), "anular")).toThrow();
  });
  it("aprobar y anular piden confirmación en su def", () => {
    const porId = Object.fromEntries(ACCIONES.map((a) => [a.id, a]));
    expect(porId.aprobar.confirmar).toBeTruthy();
    expect(porId.anular.confirmar).toBeTruthy();
  });
});
