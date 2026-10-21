import { describe, expect, it } from "vitest";
import { calcularDetalleMetricas, contarEntregas, type IncidenciaMetricas } from "../metricas-personales";
import type { MovimientoRegistrado } from "../metricas";

const mov = (dia: string, motivo: string, operarioId = "ivan", ofId = "of1"): MovimientoRegistrado => ({ at: `2026-${dia}T10:00:00Z`, motivo, operarioId, ofId, observacion: null });
const periodo = { desde: "2026-09-01", hasta: "2026-10-31" };
const familias = new Map([["of1", "TOLDO"], ["of2", "LONA"]]);
const calcular = (movs: MovimientoRegistrado[], contexto = movs, incidencias: IncidenciaMetricas[] | null = []) => calcularDetalleMetricas(movs, contexto, familias, incidencias, "ivan", periodo, ["2026-09", "2026-10"]);

describe("mis métricas", () => {
  it("incluye las OF que el autor entrega sin revisión", () => {
    expect(calcular([mov("09-01", "aprobar_sin_revision"), mov("09-02", "aprobar_sin_revision")]).personal.entregadas).toBe(1);
  });
  it("atribuye la corrección al autor anterior al filtro y nunca al revisor", () => {
    const entrega = mov("08-31", "terminar_planteo");
    const vuelta = mov("09-01", "devolver", "jaime");
    expect(calcular([vuelta], [entrega, vuelta]).personal.correcciones).toBe(1);
    expect(calcularDetalleMetricas([vuelta], [entrega, vuelta], familias, [], "jaime", periodo, ["2026-09"]).personal.correcciones).toBe(0);
  });
  it("no inventa autor cuando falta una entrega y respeta los traspasos", () => {
    expect(calcular([mov("09-01", "devolver", "jaime")]).personal.correcciones).toBe(0);
    const movs = [mov("09-01", "terminar_planteo"), mov("09-02", "terminar_planteo", "alberto"), mov("09-03", "devolver", "jaime")];
    expect(calcular(movs).personal.correcciones).toBe(0);
    expect(calcular([mov("09-01", "terminar_planteo"), mov("09-02", "aprobar", "jaime"), mov("09-03", "devolver", "jaime")]).personal.correcciones).toBe(0);
  });
  it("cuenta OF distintas, mantiene los meses sin actividad y no duplica el contexto", () => {
    const movs = [mov("09-01", "terminar_planteo"), mov("09-02", "devolver", "jaime"), mov("09-03", "terminar_planteo"), mov("09-04", "devolver", "jaime")];
    const p = calcular(movs).personal;
    expect(p.entregadas).toBe(1);
    expect(p.correcciones).toBe(1);
    expect(p.meses).toEqual([{ mes: "2026-09", entregadas: 1, correcciones: 1, incidencias: 0 }, { mes: "2026-10", entregadas: 0, correcciones: 0, incidencias: 0 }]);
    expect(p.correccionesPorFamilia).toEqual([{ familia: "TOLDO", n: 1, porCausa: [{ id: null, n: 1 }] }]);
  });
  it("solo cuenta la OF devuelta de un pedido con otras OF aprobadas", () => {
    const movs = [mov("09-01", "terminar_planteo"), mov("09-01", "terminar_planteo", "ivan", "of2"),
      { ...mov("09-02", "devolver", "jaime"), observacion: "[1,2] Corregir las medidas" },
      mov("09-02", "aprobar", "jaime", "of2")];
    const p = calcular(movs).personal;
    expect(p.correcciones).toBe(1);
    expect(p.correccionesPorFamilia).toEqual([{ familia: "TOLDO", n: 1, porCausa: [{ id: 1, n: 1 }, { id: 2, n: 1 }] }]);
  });
  it("dos OF devueltas cuentan dos, deduplicando cada causa en cada OF", () => {
    const movs = [mov("09-01", "terminar_planteo"), mov("09-01", "terminar_planteo", "ivan", "of2"),
      { ...mov("09-02", "devolver", "jaime"), observacion: "[1,1,2] Dos causas" },
      mov("09-03", "terminar_planteo"),
      { ...mov("09-04", "devolver", "jaime"), observacion: "[1,3] Vuelve otra vez" },
      { ...mov("09-04", "devolver", "jaime", "of2"), observacion: "[1] Otra OF" }];
    const p = calcularDetalleMetricas(movs, movs, new Map([["of1", "TOLDO"], ["of2", "TOLDO"]]), [], "ivan", periodo, ["2026-09"]).personal;
    expect(p.correcciones).toBe(2);
    expect(p.correccionesPorFamilia).toEqual([{ familia: "TOLDO", n: 2, porCausa: [{ id: 1, n: 2 }, { id: 2, n: 1 }, { id: 3, n: 1 }] }]);
  });
  it("las causas del bloque personal solo proceden de las OF del autor", () => {
    const movs = [mov("09-01", "terminar_planteo"), mov("09-01", "terminar_planteo", "alberto", "of2"),
      { ...mov("09-02", "devolver", "jaime"), observacion: "[1] Mía" },
      { ...mov("09-02", "devolver", "jaime", "of2"), observacion: "[2] De Alberto" }];
    expect(calcular(movs).personal.correccionesPorFamilia).toEqual([{ familia: "TOLDO", n: 1, porCausa: [{ id: 1, n: 1 }] }]);
  });
  it("deduplica varios bonos de una OF sin sumar los totales mensuales", () => {
    const i = (fecha: string, orden = "123"): IncidenciaMetricas => ({ fecha, orden, familia: "TOLDO" });
    const p = calcular([], [], [i("2026-09-01"), i("2026-09-02"), i("2026-10-01"), i("2026-08-31", "fuera"), i("2026-11-01", "fuera2")]).personal;
    expect(p.incidencias).toBe(1);
    expect(p.meses.map((m) => m.incidencias)).toEqual([1, 1]);
    expect(p.incidenciasPorFamilia).toEqual([{ familia: "TOLDO", n: 1 }]);
  });
  it("distingue una fuente no disponible de cero incidencias", () => {
    expect(calcular([], [], null).personal.incidencias).toBeNull();
    expect(calcular([], [], []).personal.incidencias).toBe(0);
  });
  it("agrupa devoluciones por familia y conserva las de familia desconocida", () => {
    const d = calcular([mov("09-01", "devolver", "jaime"), mov("09-02", "devolver", "jaime", "otra")]);
    expect(d.porFamilia.map((f) => [f.familia, f.devoluciones]).sort()).toEqual([["Sin familia conocida", 1], ["TOLDO", 1]]);
  });
});

describe("proporción de entregas a revisión", () => {
  it("incluye las entregadas sin revisión y cuenta cada OF una sola vez", () => {
    expect(contarEntregas([mov("09-01", "terminar_planteo"), mov("09-02", "terminar_planteo"), mov("09-03", "aprobar_sin_revision"), mov("09-04", "aprobar_sin_revision", "ivan", "of2")])).toEqual({ revision: 1, total: 2 });
    expect(contarEntregas([])).toEqual({ revision: 0, total: 0 });
  });
});
