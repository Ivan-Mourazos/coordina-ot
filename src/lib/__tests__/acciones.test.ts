import { describe, expect, it } from "vitest";
import { ACCIONES, accionesDisponibles, aplicarAccion, aprobadaSinRevision } from "../acciones";
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
    // Sí ofrece recuperar: es del AUTOR y no depende de que haya revisor.
    expect(accionesDisponibles(of("por_revisar", { revisorId: null })).map((a) => a.id))
      .toEqual(["recuperar_planteo", "anular"]);
  });
  it("el autor puede recuperar de por_revisar; el revisor no", () => {
    // La red de verdad de "solo el autor la recupera": sin esto, el revisor
    // podría devolverle el trabajo al autor por una puerta que no es la suya
    // (para eso está "devolver", que obliga a decir por qué).
    const x = of("por_revisar");
    expect(accionesDisponibles(x, "op1").map((a) => a.id)).toContain("recuperar_planteo");
    expect(accionesDisponibles(x, "op2").map((a) => a.id)).not.toContain("recuperar_planteo");
  });
  it("recuperar devuelve la OF al planteo sin tocar al revisor", () => {
    // El revisor se conserva a propósito: al volver a mandarla, el selector ya
    // viene con él puesto.
    const r = aplicarAccion(of("por_revisar"), "recuperar_planteo");
    expect(r.estado).toBe("en_curso");
    expect(r.revisorId).toBe("op2");
  });
  it("una vez el revisor la cogió, ya no se recupera a la fuerza", () => {
    // Desde en_revision no: el trabajo ya es suyo y quitárselo sin avisar le
    // borra el rato que lleva. Ahí toca hablarlo (devolver o soltar).
    expect(accionesDisponibles(of("en_revision"), "op1").map((a) => a.id))
      .not.toContain("recuperar_planteo");
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

  it("no es un atajo para saltarse la PRIMERA revisión", () => {
    // Desde en_curso sí sale, pero solo con revisor nombrado —una OF que ya
    // pasó por revisión y se está corrigiendo—; ese caso tiene su propio test
    // más abajo. Sin revisor no aparece desde ningún estado.
    for (const e of ["pendiente", "en_curso", "por_revisar", "en_revision"] as const)
      expect(accionesDisponibles(of(e, { revisorId: null })).map((a) => a.id))
        .not.toContain("aprobar_corregida");
    // Y con revisor tampoco desde los estados en que la pelota es del revisor.
    for (const e of ["por_revisar", "en_revision"] as const)
      expect(accionesDisponibles(of(e)).map((a) => a.id)).not.toContain("aprobar_corregida");
  });

  it("exige autor y corta el fichaje, como cualquier entrega", () => {
    const porId = Object.fromEntries(ACCIONES.map((a) => [a.id, a]));
    // "revisor" y no "autor": lo que acota esta acción es que la OF YA pasó por
    // revisión. Que sea del autor lo dice `soloEl`, que además implica que hay
    // autor.
    expect(porId.aprobar_corregida.requiere).toBe("revisor");
    expect(porId.aprobar_corregida.soloEl).toBe("autor");
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

describe("aprobar sin revisión", () => {
  it("el autor puede darla por buena desde en_curso", () => {
    // Hay trabajo que siempre hace la misma persona (ASSA ABLOY es de Tamara):
    // montar una revisión ahí es papeleo por el papeleo, y hasta ahora había
    // que ir a la herramienta vieja para pasarlo.
    const x = of("en_curso", { revisorId: null });
    expect(accionesDisponibles(x, "op1").map((a) => a.id)).toContain("aprobar_sin_revision");
  });

  it("NO desde devuelta: ahí ya hay un revisor que opinó", () => {
    // Saltárselo por esta puerta le quitaría la última palabra sobre un trabajo
    // que él mismo marcó como incompleto.
    expect(accionesDisponibles(of("devuelta"), "op1").map((a) => a.id))
      .not.toContain("aprobar_sin_revision");
  });

  it("es del AUTOR, no de cualquiera", () => {
    const x = of("en_curso", { revisorId: null });
    expect(accionesDisponibles(x, "op2").map((a) => a.id)).not.toContain("aprobar_sin_revision");
  });

  it("deja la OF aprobada y sin revisor, y eso es lo que la distingue", () => {
    const r = aplicarAccion(of("en_curso", { revisorId: null }), "aprobar_sin_revision");
    expect(r.estado).toBe("aprobada");
    expect(r.revisorId).toBeNull();
    expect(aprobadaSinRevision(r)).toBe(true);
  });

  it("una aprobada NORMAL no se confunde con una sin revisar", () => {
    // Los dos caminos normales a aprobada exigen revisor, así que el hueco solo
    // lo deja esta acción.
    expect(aprobadaSinRevision(of("aprobada"))).toBe(false);
    expect(aprobadaSinRevision(of("en_curso", { revisorId: null }))).toBe(false);
  });
});

describe("pasar a aprobada sin una segunda revisión", () => {
  const ids = (estado: OF["estado"], extra: Partial<OF>) =>
    accionesDisponibles(of(estado, extra), "op1").map((a) => a.id);

  it("fichar en una DEVUELTA no hace desaparecer 'Dar por corregida'", () => {
    // EL BUG QUE SE ARREGLA: fichar dispara `retomar`, que la pasa a en_curso.
    // Con el botón atado solo a `devuelta`, ponerte a corregir con el reloj en
    // marcha lo borraba de la pantalla sin decir nada, y solo quedaba mandarla
    // otra vez a revisión.
    expect(ids("devuelta", { revisorId: "op2" })).toContain("aprobar_corregida");
    expect(ids("en_curso", { revisorId: "op2" })).toContain("aprobar_corregida");
  });

  it("los dos botones NUNCA salen a la vez", () => {
    // Son la misma transición contando cosas distintas; juntos habría que
    // adivinar cuál pulsar.
    const conRevisor = ids("en_curso", { revisorId: "op2" });
    expect(conRevisor).toContain("aprobar_corregida");
    expect(conRevisor).not.toContain("aprobar_sin_revision");

    const sinRevisor = ids("en_curso", { revisorId: null });
    expect(sinRevisor).toContain("aprobar_sin_revision");
    expect(sinRevisor).not.toContain("aprobar_corregida");
  });

  it("sin revisor no se puede 'dar por corregida': no hubo quien la devolviera", () => {
    expect(ids("en_curso", { revisorId: null })).not.toContain("aprobar_corregida");
  });

  it("las dos llevan a aprobada, y solo la de verdad sin revisar se marca así", () => {
    const corregida = aplicarAccion(of("en_curso", { revisorId: "op2" }), "aprobar_corregida");
    expect(corregida.estado).toBe("aprobada");
    // Sí hubo revisión en su momento, así que NO es una "aprobada sin revisión".
    expect(aprobadaSinRevision(corregida)).toBe(false);

    const sinRevisar = aplicarAccion(of("en_curso", { revisorId: null }), "aprobar_sin_revision");
    expect(aprobadaSinRevision(sinRevisar)).toBe(true);
  });

  it("sigue siendo del AUTOR: el revisor no la cierra por esta puerta", () => {
    expect(accionesDisponibles(of("en_curso", { revisorId: "op2" }), "op2").map((a) => a.id))
      .not.toContain("aprobar_corregida");
  });
});
