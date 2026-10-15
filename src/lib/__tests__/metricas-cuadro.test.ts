import { describe, expect, it } from "vitest";
import { calcularCuadroMetricas } from "../metricas-cuadro";
import type { MovimientoRegistrado } from "../metricas";

const mov = (dia: string, motivo: string, operarioId: string | null = "alberto", ofId = "of1"): MovimientoRegistrado => ({ at: `2026-${dia}:00.000Z`, motivo, operarioId, ofId, observacion: null });
const calcular = (m: MovimientoRegistrado[], contexto = m) => calcularCuadroMetricas(m, contexto, ["alberto", "jaime", "ivan"]);

describe("reparto por técnico", () => {
  it("cuenta las firmas y atribuye la devolución a quien entregó, no al revisor", () => {
    const c = calcular([mov("09-01T08:00", "terminar_planteo"), mov("09-01T09:00", "empezar_revision", "jaime"), mov("09-01T10:00", "devolver", "jaime")]);
    expect(c.porTecnico).toEqual([
      { operarioId: "alberto", planteos: 1, revisiones: 0, planteosRevisados: 1, devoluciones: 1, proporcion: 1 },
      { operarioId: "jaime", planteos: 0, revisiones: 1, planteosRevisados: 0, devoluciones: 0, proporcion: null },
    ]);
  });
  it("usa la última entrega anterior aunque cambie el autor y haya varias vueltas", () => {
    const c = calcular([mov("09-01T08:00", "terminar_planteo"), mov("09-01T09:00", "empezar_revision", "jaime"), mov("09-01T10:00", "devolver", "jaime"),
      mov("09-02T08:00", "terminar_planteo", "ivan"), mov("09-02T09:00", "empezar_revision", "jaime"), mov("09-02T10:00", "devolver", "jaime")]);
    expect(c.porTecnico.find((p) => p.operarioId === "alberto")).toMatchObject({ devoluciones: 1, planteosRevisados: 1 });
    expect(c.porTecnico.find((p) => p.operarioId === "ivan")).toMatchObject({ planteos: 1, devoluciones: 1, proporcion: 1 });
  });
  it("divide por revisiones de sus entregas, no por revisiones que él hace", () => {
    const c = calcular([mov("09-01T08:00", "terminar_planteo"), mov("09-01T09:00", "empezar_revision", "jaime"), mov("09-01T10:00", "devolver", "jaime"),
      mov("09-02T08:00", "terminar_planteo", "alberto", "of2"), mov("09-02T09:00", "empezar_revision", "ivan", "of2"), mov("09-02T10:00", "aprobar", "ivan", "of2")]);
    expect(c.porTecnico[0]).toMatchObject({ revisiones: 0, planteosRevisados: 2, devoluciones: 1, proporcion: .5 });
  });
  it("consulta el autor anterior al filtro sin sumar su entrega al periodo", () => {
    const entrega = mov("08-31T08:00", "terminar_planteo");
    const seleccion = [mov("09-01T09:00", "empezar_revision", "jaime"), mov("09-01T10:00", "devolver", "jaime")];
    const c = calcular(seleccion, [entrega, ...seleccion]);
    expect(c.porTecnico[0]).toMatchObject({ operarioId: "alberto", planteos: 0, planteosRevisados: 1, devoluciones: 1 });
  });
  it("no asigna al revisor una devolución sin autor fiable", () => {
    const c = calcular([mov("09-01T09:00", "empezar_revision", "jaime"), mov("09-01T10:00", "devolver", "jaime")]);
    expect(c.porTecnico).toHaveLength(1);
    expect(c.porTecnico[0]).toMatchObject({ operarioId: "jaime", devoluciones: 0, proporcion: null });
  });
  it("una entrega sin firma reemplaza la atribución anterior", () => {
    const c = calcular([mov("09-01T08:00", "terminar_planteo"), mov("09-01T09:00", "terminar_planteo", null), mov("09-01T10:00", "devolver", "jaime")]);
    expect(c.porTecnico[0]).toMatchObject({ devoluciones: 0, proporcion: null });
  });
  it("infiere el repaso de una devolución sin inicio y no inventa revisiones firmadas", () => {
    const c = calcular([mov("09-01T08:00", "terminar_planteo"), mov("09-01T10:00", "devolver", "jaime"), mov("09-01T11:00", "devolver", "jaime")]);
    expect(c.porTecnico[0]).toMatchObject({ planteosRevisados: 2, devoluciones: 2, proporcion: 1 });
    expect(c.porTecnico[1].revisiones).toBe(0);
  });
  it("respeta la sección y no incorpora a quien solo tiene contexto antiguo", () => {
    const seleccionado = [mov("09-01T08:00", "terminar_planteo", "ivan")];
    const c = calcularCuadroMetricas(seleccionado, [mov("08-01T08:00", "terminar_planteo"), ...seleccionado], ["ivan"]);
    expect(c.porTecnico.map((p) => p.operarioId)).toEqual(["ivan"]);
  });
  it("no atribuye una entrega futura ni modifica los arrays recibidos", () => {
    const m = [mov("09-02T08:00", "terminar_planteo"), mov("09-01T08:00", "devolver", "jaime")];
    const copia = structuredClone(m);
    expect(calcular(m).porTecnico.find((p) => p.operarioId === "alberto")?.devoluciones).toBe(0);
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
  it("mantiene las devoluciones en la semana de su revisión y rellena huecos", () => {
    const m = [mov("09-01T08:00", "empezar_revision"), mov("09-09T08:00", "devolver")];
    const c = calcularCuadroMetricas(m, m, ["alberto"], { desde: "2026-09-01", hasta: "2026-09-30" });
    expect(c.tendencia).toHaveLength(5);
    expect(c.tendencia[0].proporcion).toBe(1);
    expect(c.tendencia[1].proporcion).toBeNull();
    expect(c.tendencia[4].planteos).toBe(0);
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
