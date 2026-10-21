import { beforeEach, describe, expect, it, vi } from "vitest";

const fuentes = vi.hoisted(() => ({ familias: vi.fn(), incidencias: vi.fn(), pases: vi.fn(), movimientos: vi.fn(), login: false }));
vi.mock("../server/metricas-fuentes", () => ({ leerFamiliasMetricas: fuentes.familias, leerIncidenciasMetricas: fuentes.incidencias, leerPasesRps: fuentes.pases }));
vi.mock("../server/estado-db", () => ({ leerMovimientosMetricas: fuentes.movimientos, leerCausasDevolucion: () => [], leerPasosRevision: () => [], leerPasesMetricas: () => [] }));
vi.mock("../server/fichaje-db", () => ({ leerIntervalosMetricas: () => [] }));
vi.mock("../server/sesion", () => ({ soloConSesion: () => null, loginActivo: () => fuentes.login, quienEs: () => ({ id: "ivan" }) }));
import { GET } from "@/app/api/metricas/route";

beforeEach(() => {
  vi.clearAllMocks();
  fuentes.login = false;
  fuentes.familias.mockResolvedValue(new Map());
  fuentes.incidencias.mockResolvedValue([]);
  fuentes.pases.mockResolvedValue([]);
  fuentes.movimientos.mockReturnValue([]);
});

describe("detalle de métricas", () => {
  it("los indicadores y desgloses cuentan solo el mes y las gráficas comparan meses", async () => {
    const movs = [
      { at: "2026-08-31T10:00:00Z", motivo: "terminar_planteo", ofId: "of1", operarioId: "ivan", observacion: null },
      { at: "2026-09-01T10:00:00Z", motivo: "devolver", ofId: "of1", operarioId: "jaime", observacion: "[1] Medidas" },
      { at: "2026-09-02T10:00:00Z", motivo: "terminar_planteo", ofId: "of2", operarioId: "ivan", observacion: null },
      { at: "2026-09-03T10:00:00Z", motivo: "devolver", ofId: "of2", operarioId: "jaime", observacion: "[2] Material" },
    ];
    fuentes.movimientos.mockImplementation((desde?: string, hasta?: string) => movs.filter((m) => (!desde || m.at >= desde) && (!hasta || m.at < hasta)));
    fuentes.familias.mockResolvedValue(new Map([["of1", "TOLDO"], ["of2", "LONA"]]));
    // Sin autor en RPS: son de ivan porque las entregó él en Coordina.
    fuentes.incidencias.mockResolvedValue([{ fecha: "2026-08-15", orden: "of1", familia: "TOLDO" }, { fecha: "2026-09-15", orden: "of2", familia: "LONA" }]);
    const r = await GET(new Request("http://localhost/api/metricas?detalle=1&operario=ivan&desde=2026-09-01&hasta=2026-09-30"));
    const datos = await r.json();
    expect(datos.metricas.volumen.ofEntregadas).toBe(1);
    // Las gráficas son del AÑO, no hasta el mes elegido: de agosto (cuando
    // empieza el registro) a hoy.
    const mesesAnio = datos.cuadro.meses.map((m: { mes: string }) => m.mes);
    expect(mesesAnio.slice(0, 2)).toEqual(["2026-08", "2026-09"]);
    expect(mesesAnio.at(-1)).toBe(new Date().toISOString().slice(0, 7) > "2026-12" ? "2026-12" : new Date().toISOString().slice(0, 7));
    expect(datos.cuadro.tendencia).toHaveLength(mesesAnio.length);
    // Cada uno ve lo suyo: el reparto por técnico no sale de la API.
    expect(datos.cuadro.porTecnico).toEqual([]);
    expect(datos.detalle.personal.entregadas).toBe(1);
    expect(datos.detalle.personal.correcciones).toBe(2);
    expect(datos.detalle.personal.incidencias).toBe(1);
    expect(datos.detalle.incidenciasOT).toEqual({ total: 1, base: 1, porFamilia: [{ familia: "LONA", n: 1, base: 1 }] });
    expect(datos.devueltas).toEqual({ entregadas: 2, devueltas: 2, porCausa: [{ id: 1, n: 1 }, { id: 2, n: 1 }] });
    // Mis datos va de enero: antes de Coordina, sin devoluciones (null).
    const personal = datos.detalle.personal.meses;
    expect(personal[0]).toEqual({ mes: "2026-01", entregadas: 0, sinRevision: null, correcciones: null, incidencias: 0 });
    expect(personal.slice(7, 9)).toEqual([
      { mes: "2026-08", entregadas: 1, sinRevision: 0, correcciones: 0, incidencias: 1 },
      { mes: "2026-09", entregadas: 1, sinRevision: 0, correcciones: 2, incidencias: 1 },
    ]);
    // Las incidencias y las OF pasadas de RPS se piden del año entero.
    expect(fuentes.incidencias).toHaveBeenCalledWith(expect.objectContaining({ desde: "2026-01-01" }), "ot");
    expect(fuentes.pases).toHaveBeenCalledWith(expect.objectContaining({ desde: "2026-01-01" }), "ot");
    const anterior = await GET(new Request("http://localhost/api/metricas?detalle=1&operario=ivan&desde=2026-08-01&hasta=2026-08-31"));
    const agosto = await anterior.json();
    // Elegir agosto no recorta la gráfica: sigue siendo el año entero.
    expect(agosto.cuadro.meses.map((m: { mes: string }) => m.mes)).toEqual(mesesAnio);
    expect(agosto.detalle.personal.correcciones).toBe(0);
  });
  it("las comparaciones no consultan las fuentes de RPS", async () => {
    const r = await GET(new Request("http://localhost/api/metricas?desde=2026-09-01&hasta=2026-09-30"));
    expect(r.status).toBe(200);
    expect(fuentes.familias).not.toHaveBeenCalled();
    expect(fuentes.incidencias).not.toHaveBeenCalled();
    expect((await r.json()).detalle).toBeUndefined();
  });
  it("con sesión no permite pedir los datos personales de otro técnico", async () => {
    fuentes.login = true;
    fuentes.movimientos.mockReturnValue([{ at: "2026-09-02T10:00:00Z", motivo: "terminar_planteo", ofId: "of1", operarioId: "ivan", observacion: null }]);
    const r = await GET(new Request("http://localhost/api/metricas?detalle=1&operario=jaime&desde=2026-09-01&hasta=2026-09-30"));
    expect(r.status).toBe(200);
    // Pide las de jaime, pero la sesión es de ivan: salen las de ivan.
    expect((await r.json()).detalle.personal.entregadas).toBe(1);
  });
  it("conserva las métricas locales si falla RPS y no presenta un falso cero", async () => {
    fuentes.familias.mockRejectedValue(new Error("sin conexión"));
    fuentes.incidencias.mockRejectedValue(new Error("sin conexión"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await GET(new Request("http://localhost/api/metricas?detalle=1&operario=ivan&desde=2026-09-01&hasta=2026-09-30"));
      const datos = await r.json();
      expect(r.status).toBe(200);
      expect(datos.metricas.volumen.ofEntregadas).toBe(0);
      expect(datos.detalle.familiasDisponibles).toBe(false);
      expect(datos.detalle.personal.incidencias).toBeNull();
      expect(datos.detalle.incidenciasOT).toBeNull();
    } finally { log.mockRestore(); }
  });
});
