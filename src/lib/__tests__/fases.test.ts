import { describe, expect, it } from "vitest";
import { ESTADO_FASE, eventosFaseDe, eventosFinalizacion } from "../fases";
import type { Intervalo } from "../fichaje";

const iv = (inicio: string, fin: string | null, ofIds: string[]): Intervalo => ({
  inicio,
  fin,
  ofIds,
  rol: "plantear",
  operarioId: "ivan",
});

const T0 = "2026-08-03T08:00:00.000Z";
const T1 = "2026-08-03T08:30:00.000Z";
const T2 = "2026-08-03T09:00:00.000Z";

describe("eventosFaseDe", () => {
  it("un intervalo cerrado abre y cierra la fase", () => {
    const e = eventosFaseDe([iv(T0, T1, ["0230344:2"])]);
    expect(e).toEqual([
      { of: "0230344", numope: "2", estado: ESTADO_FASE.iniciada, operarioId: "ivan", cuando: T0 },
      { of: "0230344", numope: "2", estado: ESTADO_FASE.interrumpida, operarioId: "ivan", cuando: T1 },
    ]);
  });

  it("un intervalo abierto ya marca la fase como iniciada, sin interrumpirla", () => {
    const e = eventosFaseDe([iv(T0, null, ["0230344:2"])]);
    expect(e.map((x) => x.estado)).toEqual([ESTADO_FASE.iniciada]);
  });

  it("cada OF del tramo tiene su propio movimiento", () => {
    const e = eventosFaseDe([iv(T0, T1, ["A:1", "B:2"])]);
    expect(e).toHaveLength(4);
    expect(new Set(e.map((x) => x.of))).toEqual(new Set(["A", "B"]));
  });

  it("reanudar la misma OF da la alternancia 1→2→1 del mini-olanet", () => {
    const e = eventosFaseDe([iv(T0, T1, ["A:1"]), iv(T1, T2, ["A:1"])]);
    expect(e.map((x) => x.estado)).toEqual([
      ESTADO_FASE.iniciada,
      ESTADO_FASE.interrumpida,
      ESTADO_FASE.iniciada,
      ESTADO_FASE.interrumpida,
    ]);
  });

  it("nunca genera un 3: finalizar no sale del fichaje", () => {
    const e = eventosFaseDe([iv(T0, T1, ["A:1"]), iv(T1, T2, ["B:2"])]);
    expect(e.some((x) => x.estado === ESTADO_FASE.finalizada)).toBe(false);
  });

  it("ignora las OFs sin CodTarea en el id", () => {
    expect(eventosFaseDe([iv(T0, T1, ["A"])])).toEqual([]);
  });
});

describe("eventosFinalizacion", () => {
  it("marca finalizada una fase por OF del pedido", () => {
    const e = eventosFinalizacion(["A:1", "B:2"], "ivan", T1);
    expect(e.map((x) => [x.of, x.numope, x.estado])).toEqual([
      ["A", "1", ESTADO_FASE.finalizada],
      ["B", "2", ESTADO_FASE.finalizada],
    ]);
    expect(e.every((x) => x.cuando === T1)).toBe(true);
  });

  it("un pedido sin OFs utilizables no genera nada", () => {
    expect(eventosFinalizacion(["sin-tarea"], "ivan", T1)).toEqual([]);
  });
});
