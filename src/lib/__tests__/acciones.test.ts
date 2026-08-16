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
  it("anular se ofrece en todo el ciclo menos en aprobada", () => {
    const estados: OF["estado"][] = [
      "pendiente", "en_curso", "por_revisar", "en_revision", "devuelta",
    ];
    for (const e of estados)
      expect(accionesDisponibles(of(e)).map((a) => a.id)).toContain("anular");
    expect(accionesDisponibles(of("aprobada")).map((a) => a.id)).not.toContain("anular");
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
  it("terminar_planteo también sale de devuelta directo a por_revisar", () => {
    expect(aplicarAccion(of("devuelta"), "terminar_planteo").estado).toBe("por_revisar");
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
  it("anular conserva el tiempo ya fichado: solo cambia el estado", () => {
    const conTiempo = of("en_curso", { tiempoPlanteoMin: 101, tiempoRevisionMin: 12 });
    const r = aplicarAccion(conTiempo, "anular", "taller");
    expect(r.estado).toBe("anulada");
    expect(r.tiempoPlanteoMin).toBe(101);
    expect(r.tiempoRevisionMin).toBe(12);
  });
  it("anular exige decir POR QUÉ: sin motivo no se anula", () => {
    // Al repasar las anuladas, "anulada" a secas no dice nada. La causa se
    // elige al anular y se guarda en `observacion` (ver lib/anulacion.ts).
    expect(() => aplicarAccion(of("en_curso"), "anular")).toThrow();
    expect(aplicarAccion(of("en_curso"), "anular", "taller").observacion).toBe("taller");
  });
  it("aprobar pide confirmación; anular no, porque elegir el motivo YA la es", () => {
    const porId = Object.fromEntries(ACCIONES.map((a) => [a.id, a]));
    expect(porId.aprobar.confirmar).toBeTruthy();
    expect(porId.anular.confirmar).toBeFalsy();
    expect(porId.anular.conMotivo).toBe(true);
  });
});

// Segunda vuelta sin segunda revisión: la OF ya se revisó, volvió con nota y el
// autor hizo el retoque. Si el cambio era mínimo, tiene que poder darse por
// buena sin otra ronda — pero sin quitar el camino normal.
describe("aprobar_corregida", () => {
  it("una devuelta ofrece las DOS salidas: revisión o darla por corregida", () => {
    expect(accionesDisponibles(of("devuelta")).map((a) => a.id))
      .toEqual(["retomar", "terminar_planteo", "aprobar_corregida", "anular"]);
  });

  it("aprueba directamente, sin pasar por revisión", () => {
    expect(aplicarAccion(of("devuelta"), "aprobar_corregida").estado).toBe("aprobada");
  });

  it("solo desde devuelta: no es un atajo para saltarse la primera revisión", () => {
    for (const e of ["pendiente", "en_curso", "por_revisar", "en_revision"] as const)
      expect(accionesDisponibles(of(e)).map((a) => a.id)).not.toContain("aprobar_corregida");
  });

  it("exige autor y corta el fichaje, como cualquier entrega", () => {
    const porId = Object.fromEntries(ACCIONES.map((a) => [a.id, a]));
    expect(porId.aprobar_corregida.requiere).toBe("autor");
    expect(porId.aprobar_corregida.efectoFichaje).toBe("corta");
    // En tono neutro: el camino que se ofrece primero sigue siendo mandar a
    // revisar, que es "primaria".
    expect(porId.aprobar_corregida.tono).toBe("neutra");
    expect(porId.terminar_planteo.tono).toBe("primaria");
    // Y pide confirmación: se salta un paso del flujo, no es un clic más.
    expect(porId.aprobar_corregida.confirmar).toBeTruthy();
  });
});

// ─── Cada botón, a quien le toca ─────────────────────────────────────────────
// El autor de una OF en revisión veía "Aprobar", "Devolver con nota" y "Dejar
// sin revisar": las tres decisiones del compañero que estaba repasando SU
// trabajo. Pulsarlas era aprobarse el planteo a sí mismo, contra la regla dura
// del dominio (revisor ≠ autor).
describe("de quién es cada acción", () => {
  const AUTOR = "op1";
  const REVISOR = "op2";
  const OTRO = "op9";
  const ids = (estado: OF["estado"], miId: string | null | undefined) =>
    accionesDisponibles(of(estado), miId).map((a) => a.id);

  it("en revisión: al revisor le tocan las tres decisiones", () => {
    expect(ids("en_revision", REVISOR)).toEqual([
      "aprobar", "devolver", "soltar_revision", "anular",
    ]);
  });

  it("en revisión: al autor NO le sale ninguna de las tres", () => {
    expect(ids("en_revision", AUTOR)).toEqual(["anular"]);
  });

  it("en revisión: a un tercero tampoco", () => {
    expect(ids("en_revision", OTRO)).toEqual(["anular"]);
  });

  it("pasar a revisión es del autor, no de quien abra la OF", () => {
    expect(ids("en_curso", AUTOR)).toContain("terminar_planteo");
    expect(ids("en_curso", REVISOR)).not.toContain("terminar_planteo");
  });

  it("dar por corregida es del autor: la corrección la hizo él", () => {
    expect(ids("devuelta", AUTOR)).toContain("aprobar_corregida");
    expect(ids("devuelta", REVISOR)).not.toContain("aprobar_corregida");
  });

  it("reabrir la revisión la pueden pedir los dos", () => {
    expect(ids("aprobada", AUTOR)).toEqual(["reabrir"]);
    expect(ids("aprobada", REVISOR)).toEqual(["reabrir"]);
  });

  it("anular no tiene dueño: se decide al ver el pedido", () => {
    expect(ids("en_curso", OTRO)).toContain("anular");
  });

  it("sin identidad elegida no se recorta nada: se contesta qué admite la OF", () => {
    expect(ids("en_revision", null)).toEqual([
      "aprobar", "devolver", "soltar_revision", "anular",
    ]);
    expect(ids("en_revision", undefined)).toEqual([
      "aprobar", "devolver", "soltar_revision", "anular",
    ]);
  });
});
