import { describe, expect, it } from "vitest";
import { calcularCuadroMetricas } from "../metricas-cuadro";
import type { MovimientoRegistrado } from "../metricas";

const mov = (dia: string, motivo: string, operarioId: string | null = "alberto", ofId = "of1"): MovimientoRegistrado => ({ at: `2026-${dia}:00.000Z`, motivo, operarioId, ofId, observacion: null });
const calcular = (m: MovimientoRegistrado[], contexto = m) => calcularCuadroMetricas(m, contexto, ["alberto", "jaime", "ivan"]);

describe("reparto por técnico", () => {
  it("cuenta solo volumen firmado: planteos entregados y revisiones hechas", () => {
    const c = calcular([mov("09-01T08:00", "terminar_planteo"), mov("09-01T09:00", "empezar_revision", "jaime"), mov("09-01T10:00", "devolver", "jaime")]);
    expect(c.porTecnico).toEqual([
      { operarioId: "alberto", planteos: 1, revisiones: 0 },
      { operarioId: "jaime", planteos: 0, revisiones: 1 },
    ]);
  });
  it("no expone devoluciones ni porcentajes por persona (decisión de Iván, 15/10/2026)", () => {
    const c = calcular([mov("09-01T08:00", "terminar_planteo"), mov("09-01T09:00", "empezar_revision", "jaime"), mov("09-01T10:00", "devolver", "jaime")]);
    for (const p of c.porTecnico) expect(Object.keys(p).sort()).toEqual(["operarioId", "planteos", "revisiones"]);
  });
  it("no suma al periodo una entrega anterior al filtro", () => {
    const entrega = mov("08-31T08:00", "terminar_planteo");
    const seleccion = [mov("09-01T09:00", "empezar_revision", "jaime")];
    const c = calcular(seleccion, [entrega, ...seleccion]);
    expect(c.porTecnico).toEqual([{ operarioId: "jaime", planteos: 0, revisiones: 1 }]);
  });
  it("respeta la sección y no incorpora a quien solo tiene contexto antiguo", () => {
    const seleccionado = [mov("09-01T08:00", "terminar_planteo", "ivan")];
    const c = calcularCuadroMetricas(seleccionado, [mov("08-01T08:00", "terminar_planteo"), ...seleccionado], ["ivan"]);
    expect(c.porTecnico.map((p) => p.operarioId)).toEqual(["ivan"]);
  });
  it("no modifica los arrays recibidos", () => {
    const m = [mov("09-02T08:00", "terminar_planteo"), mov("09-01T08:00", "devolver", "jaime")];
    const copia = structuredClone(m);
    calcular(m);
    expect(m).toEqual(copia);
  });
});

describe("ciclos completos y tendencias", () => {
  it("mide desde la primera entrega incluyendo todas las correcciones", () => {
    const c = calcular([mov("09-01T08:00", "terminar_planteo"), mov("09-01T09:00", "devolver", "jaime"), mov("09-01T10:00", "terminar_planteo"), mov("09-01T12:00", "aprobar", "jaime")]);
    expect(c.aprobacion).toEqual({ n: 1, medianaMin: 240 });
  });
  it("usa la mediana y no la media e ignora ciclos sin comienzo o sin cierre", () => {
    const m = [mov("09-01T08:00", "terminar_planteo"), mov("09-01T09:00", "aprobar"),
      mov("09-02T08:00", "terminar_planteo", "alberto", "of2"), mov("09-02T10:00", "aprobar_corregida", "alberto", "of2"),
      mov("09-03T08:00", "terminar_planteo", "alberto", "of3"), mov("09-05T08:00", "aprobar_sin_revision", "alberto", "of3"),
      mov("09-06T08:00", "aprobar", "alberto", "of4"), mov("09-07T08:00", "terminar_planteo", "alberto", "of5")];
    expect(calcular(m).aprobacion).toEqual({ n: 3, medianaMin: 120 });
  });
  it("una recuperación cancela el ciclo y una reapertura mide desde la nueva entrega", () => {
    expect(calcular([mov("09-01T08:00", "terminar_planteo"), mov("09-01T09:00", "recuperar_planteo"), mov("09-01T10:00", "aprobar")]).aprobacion.n).toBe(0);
    expect(calcular([mov("09-01T08:00", "terminar_planteo"), mov("09-01T09:00", "aprobar"), mov("09-02T08:00", "terminar_planteo"), mov("09-02T11:00", "aprobar")]).aprobacion).toEqual({ n: 2, medianaMin: 120 });
  });
  it("mide entregas anteriores al filtro solo cuando se aprueban dentro", () => {
    const entrega = mov("08-31T08:00", "terminar_planteo");
    const fin = mov("09-01T08:00", "aprobar");
    expect(calcular([fin], [entrega, fin]).aprobacion).toEqual({ n: 1, medianaMin: 1440 });
  });
  it("agrupa todo el mes en un solo punto, sin dividirlo en semanas", () => {
    const m = [mov("09-01T08:00", "empezar_revision"), mov("09-09T08:00", "devolver")];
    const c = calcularCuadroMetricas(m, m, ["alberto"], { desde: "2026-09-01", hasta: "2026-09-30" });
    expect(c.tendencia).toHaveLength(1);
    expect(c.tendencia[0].proporcion).toBe(1);
    expect(c.tendencia[0].desde).toBe("2026-09-01");
    expect(c.tendencia[0].hasta).toBe("2026-09-30");
  });
  it("mantiene la devolución en el mes de su revisión y rellena el mes siguiente", () => {
    const m = [mov("08-31T08:00", "empezar_revision"), mov("09-01T08:00", "devolver")];
    const c = calcularCuadroMetricas(m, m, ["alberto"], { desde: "2026-08-01", hasta: "2026-10-21" });
    expect(c.tendencia.map((p) => [p.desde, p.hasta, p.proporcion])).toEqual([
      ["2026-08-01", "2026-08-31", 1], ["2026-09-01", "2026-09-30", null], ["2026-10-01", "2026-10-21", null],
    ]);
  });
  it("un mes en curso solo cuenta hasta el último día solicitado", () => {
    const m = [mov("10-01T08:00", "terminar_planteo"), mov("10-10T08:00", "terminar_planteo", "alberto", "of2")];
    const c = calcularCuadroMetricas(m, m, ["alberto"], { desde: "2026-10-01", hasta: "2026-10-09" });
    expect(c.tendencia).toHaveLength(1);
    expect(c.tendencia[0]).toMatchObject({ desde: "2026-10-01", hasta: "2026-10-09", planteos: 1 });
  });
  it("agrupa periodos largos por mes y deja vacíos sin inventar datos", () => {
    const c = calcularCuadroMetricas([], [], ["ivan"], { desde: "2026-01-01", hasta: "2026-08-31" });
    expect(c.tendencia).toHaveLength(8);
    expect(c.aprobacion).toEqual({ n: 0, medianaMin: null });
    expect(c.porTecnico).toEqual([]);
  });
  it("rellena el calendario del periodo conservando los recuentos mensuales", () => {
    const m = [mov("09-01T08:00", "terminar_planteo")];
    const c = calcularCuadroMetricas(m, m, ["alberto"], { desde: "2026-07-18", hasta: "2026-10-15" });
    expect(c.meses.map((mes) => [mes.mes, mes.planteos])).toEqual([
      ["2026-07", 0], ["2026-08", 0], ["2026-09", 1], ["2026-10", 0],
    ]);
  });
});
