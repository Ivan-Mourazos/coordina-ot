import { describe, expect, it } from "vitest";
import { calcularDetalleMetricas, contarDevueltas, contarEntregas, type IncidenciaMetricas, type PaseRps } from "../metricas-personales";
import type { MovimientoRegistrado } from "../metricas";

const mov = (dia: string, motivo: string, operarioId = "ivan", ofId = "of1"): MovimientoRegistrado => ({ at: `2026-${dia}T10:00:00Z`, motivo, operarioId, ofId, observacion: null });
const periodo = { desde: "2026-09-01", hasta: "2026-10-31" };
const familias = new Map([["of1", "TOLDO"], ["of2", "LONA"]]);
const yo = { id: "ivan", codigoRps: "146" };
const sinRps = { incidencias: [] as IncidenciaMetricas[], pases: [] as PaseRps[] };
const calcular = (movs: MovimientoRegistrado[], contexto = movs, incidencias: IncidenciaMetricas[] | null = [], pases: PaseRps[] = []) =>
  calcularDetalleMetricas(movs, contexto, familias, { incidencias, pases }, yo, periodo, ["2026-09", "2026-10"]);

describe("mis métricas", () => {
  it("incluye las OF que el autor entrega sin revisión", () => {
    expect(calcular([mov("09-01", "aprobar_sin_revision"), mov("09-02", "aprobar_sin_revision")]).personal.entregadas).toBe(1);
  });
  it("atribuye la corrección al autor anterior al filtro y nunca al revisor", () => {
    const entrega = mov("08-31", "terminar_planteo");
    const vuelta = mov("09-01", "devolver", "jaime");
    expect(calcular([vuelta], [entrega, vuelta]).personal.correcciones).toBe(1);
    expect(calcularDetalleMetricas([vuelta], [entrega, vuelta], familias, sinRps, { id: "jaime", codigoRps: null }, periodo, ["2026-09"]).personal.correcciones).toBe(0);
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
    expect(p.meses).toEqual([{ mes: "2026-09", entregadas: 1, sinRevision: 0, correcciones: 1, incidencias: 0 }, { mes: "2026-10", entregadas: 0, sinRevision: 0, correcciones: 0, incidencias: 0 }]);
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
    const p = calcularDetalleMetricas(movs, movs, new Map([["of1", "TOLDO"], ["of2", "TOLDO"]]), sinRps, yo, periodo, ["2026-09"]).personal;
    expect(p.correcciones).toBe(2);
    expect(p.correccionesPorFamilia).toEqual([{ familia: "TOLDO", n: 2, porCausa: [{ id: 1, n: 2 }, { id: 2, n: 1 }, { id: 3, n: 1 }] }]);
  });
  it("las causas del bloque personal solo proceden de las OF del autor", () => {
    const movs = [mov("09-01", "terminar_planteo"), mov("09-01", "terminar_planteo", "alberto", "of2"),
      { ...mov("09-02", "devolver", "jaime"), observacion: "[1] Mía" },
      { ...mov("09-02", "devolver", "jaime", "of2"), observacion: "[2] De Alberto" }];
    expect(calcular(movs).personal.correccionesPorFamilia).toEqual([{ familia: "TOLDO", n: 1, porCausa: [{ id: 1, n: 1 }] }]);
  });
  it("distingue una fuente no disponible de cero incidencias", () => {
    const caida = calcular([], [], null);
    expect(caida.personal.incidencias).toBeNull();
    expect(caida.incidenciasOT).toBeNull();
    expect(caida.personal.meses.every((m) => m.incidencias === null)).toBe(true);
    expect(calcular([], [], []).personal.incidencias).toBe(0);
  });
});

describe("motivo de devolución por familia", () => {
  it("cuenta OF devueltas sobre OF entregadas a revisión, y cada causa una vez por OF", () => {
    const movs = [mov("09-01", "terminar_planteo"), mov("09-01", "terminar_planteo", "ivan", "of2"),
      { ...mov("09-02", "devolver", "jaime"), observacion: "[1,2] Medidas" },
      mov("09-03", "terminar_planteo"),
      { ...mov("09-04", "devolver", "jaime"), observacion: "[1] Otra vez" }];
    expect(contarDevueltas(movs)).toEqual({ entregadas: 2, devueltas: 1, porCausa: [{ id: 1, n: 1 }, { id: 2, n: 1 }] });
    expect(calcular(movs).porFamilia).toEqual([
      { familia: "TOLDO", entregadas: 1, devueltas: 1, porCausa: [{ id: 1, n: 1 }, { id: 2, n: 1 }] },
      { familia: "LONA", entregadas: 1, devueltas: 0, porCausa: [] },
    ]);
  });
  it("conserva las devoluciones de familia desconocida", () => {
    const d = calcular([mov("09-01", "devolver", "jaime"), mov("09-02", "devolver", "jaime", "otra")]);
    expect(d.porFamilia.map((f) => [f.familia, f.devueltas]).sort()).toEqual([["Sin familia conocida", 1], ["TOLDO", 1]]);
  });
});

describe("incidencias de planteamiento", () => {
  const inc = (fecha: string, orden: string, familia = "TOLDO", autor: string | null = null): IncidenciaMetricas => ({ fecha, orden, familia, autor });
  const pase = (fecha: string, orden: string, familia = "TOLDO", autor: string | null = "146"): PaseRps => ({ fecha, orden, familia, autor });
  const anio = { desde: "2026-01-01", hasta: "2026-10-31" };
  const meses = ["2026-07", "2026-08", "2026-09", "2026-10"];
  const ofA = "A:1";
  const fam = new Map([[ofA, "TOLDO"], ["B:1", "LONA"]]);

  it("una OF con varios apuntes es una incidencia; fuera del periodo no cuenta", () => {
    const d = calcular([], [], [inc("2026-09-01", "1"), inc("2026-09-02", "1"), inc("2026-10-01", "1"), inc("2026-08-31", "2"), inc("2026-11-01", "3")]);
    expect(d.incidenciasOT).toMatchObject({ total: 1, porFamilia: [{ familia: "TOLDO", n: 1 }] });
  });
  it("la incidencia es de quien la entregó en Coordina, aunque RPS diga otro autor", () => {
    const movs = [{ ...mov("09-01", "terminar_planteo", "ivan", ofA) }];
    const otro = calcularDetalleMetricas(movs, movs, fam, { incidencias: [inc("2026-09-10", "A", "TOLDO", "999")], pases: [] }, yo, periodo, ["2026-09"]);
    expect(otro.personal.incidencias).toBe(1);
    expect(otro.personal.incidenciasPorFamilia).toEqual([{ familia: "TOLDO", n: 1, base: 1 }]);
    const deJaime = calcularDetalleMetricas(movs, movs, fam, { incidencias: [inc("2026-09-10", "A", "TOLDO", "146")], pases: [] }, { id: "jaime", codigoRps: "146" }, periodo, ["2026-09"]);
    expect(deJaime.personal.incidencias).toBe(0);
    expect(deJaime.incidenciasOT?.total).toBe(1);
  });
  it("sin registro en Coordina, el autor es el de RPS", () => {
    const d = calcularDetalleMetricas([], [], fam, { incidencias: [inc("2026-07-10", "X", "LONA", "146"), inc("2026-07-11", "Y", "LONA", null)], pases: [pase("2026-07-01", "X", "LONA"), pase("2026-07-02", "Y", "LONA", "999")] }, yo, anio, meses);
    expect(d.personal.incidencias).toBe(1);
    expect(d.personal.incidenciasPorFamilia).toEqual([{ familia: "LONA", n: 1, base: 1 }]);
    expect(d.incidenciasOT).toEqual({ total: 2, base: 2, porFamilia: [{ familia: "LONA", n: 2, base: 2 }] });
  });
  it("las OF pasadas de RPS solo cuentan antes de Coordina y si Coordina no las conoce", () => {
    const movs = [mov("08-05", "terminar_planteo", "ivan", ofA)];
    const pases = [pase("2026-07-01", "A"), pase("2026-07-02", "P"), pase("2026-08-10", "R"), pase("2026-09-01", "Q")];
    const d = calcularDetalleMetricas(movs, movs, fam, { incidencias: [], pases }, yo, anio, meses);
    // A está en Coordina (agosto); P y R, sin registro y antes de septiembre,
    // por RPS; Q es de cuando todo pasaba ya por Coordina.
    expect(d.incidenciasOT?.base).toBe(3);
    expect(d.personal.entregadas).toBe(3);
    expect(d.personal.meses).toEqual([
      { mes: "2026-07", entregadas: 1, sinRevision: null, correcciones: null, incidencias: 0 },
      { mes: "2026-08", entregadas: 2, sinRevision: 0, correcciones: 0, incidencias: 0 },
      { mes: "2026-09", entregadas: 0, sinRevision: 0, correcciones: 0, incidencias: 0 },
      { mes: "2026-10", entregadas: 0, sinRevision: 0, correcciones: 0, incidencias: 0 },
    ]);
  });
  it("una OF con dos tareas es una sola OF pasada", () => {
    const movs = [mov("09-01", "terminar_planteo", "ivan", "A:1"), mov("09-01", "terminar_planteo", "ivan", "A:01")];
    const d = calcularDetalleMetricas(movs, movs, fam, { incidencias: [inc("2026-09-05", "A")], pases: [] }, yo, periodo, ["2026-09"]);
    expect(d.incidenciasOT).toMatchObject({ total: 1, base: 1 });
    expect(d.personal.entregadas).toBe(1);
  });
});

describe("proporción de entregas a revisión", () => {
  it("incluye las entregadas sin revisión y cuenta cada OF una sola vez", () => {
    expect(contarEntregas([mov("09-01", "terminar_planteo"), mov("09-02", "terminar_planteo"), mov("09-03", "aprobar_sin_revision"), mov("09-04", "aprobar_sin_revision", "ivan", "of2")])).toEqual({ revision: 1, total: 2 });
    expect(contarEntregas([])).toEqual({ revision: 0, total: 0 });
  });
});
