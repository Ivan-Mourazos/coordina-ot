import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { periodoAnioRps } from "../metricas";

const getPool = vi.hoisted(() => vi.fn());
vi.mock("../server/db", () => ({ getPool }));

// El precalentado y el refresco usan el mismo periodo que piden las gráficas.

/** Un RPS que contesta a todo sin filas y apunta cuántas consultas recibe. */
function rpsVacio(antesDeContestar?: (n: number) => Promise<void> | undefined) {
  const consultas: { texto: string; parametros: Record<string, string> }[] = [];
  const pool = {
    request() {
      const parametros: Record<string, string> = {};
      const peticion = {
        input(nombre: string, _tipo: unknown, valor: string) { parametros[nombre] = valor; return peticion; },
        async query(texto: string) {
          consultas.push({ texto, parametros });
          await antesDeContestar?.(consultas.length);
          return { recordset: [] };
        },
      };
      return peticion;
    },
  };
  return { pool, consultas };
}

/** Las cachés son del módulo: cada prueba arranca con las suyas vacías. */
async function modulos() {
  vi.resetModules();
  const { leerIncidenciasMetricas, leerPasesRps } = await import("../server/metricas-fuentes");
  const { leerNcPeriodo } = await import("../server/nc-db");
  const { precalentarMetricas } = await import("../server/metricas-precalentar");
  return { leerIncidenciasMetricas, leerPasesRps, leerNcPeriodo, precalentarMetricas };
}

const HOY = "2026-11-16";
const HORA = 3_600_000;
const fuenteDeAntes = process.env.DATASOURCE;
const rutaDeAntes = process.env.COORDINA_DB_PATH;
// El precalentado enciende la caché en disco (ver cache-disco.ts): que escriba
// en una carpeta temporal y no en data/.
let carpeta: string;
beforeEach(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), "coordina-metricas-"));
  process.env.COORDINA_DB_PATH = path.join(carpeta, "coordina.db");
  globalThis.__coordinaCacheEnDisco = undefined;
  process.env.DATASOURCE = "rps";
  getPool.mockReset();
  vi.useFakeTimers({ now: new Date(2026, 10, 16, 9, 0), toFake: ["Date", "setInterval", "clearInterval"] });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  globalThis.__coordinaCacheEnDisco = undefined;
  if (rutaDeAntes === undefined) delete process.env.COORDINA_DB_PATH;
  else process.env.COORDINA_DB_PATH = rutaDeAntes;
  await rm(carpeta, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 });
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
  if (fuenteDeAntes === undefined) delete process.env.DATASOURCE;
  else process.env.DATASOURCE = fuenteDeAntes;
});

describe("el año que las gráficas de Métricas piden a RPS", () => {
  it("del año en curso, hasta hoy", () => {
    expect(periodoAnioRps("2026", HOY)).toEqual({ desde: "2026-01-01", hasta: HOY });
  });

  it("de un año ya cerrado, entero", () => {
    expect(periodoAnioRps("2026", "2027-02-03")).toEqual({ desde: "2026-01-01", hasta: "2026-12-31" });
  });
});

describe("las fuentes de RPS de Métricas al arrancar el servidor", () => {
  it("lo que piden las gráficas ya está pedido: abrir Métricas no vuelve a consultar", async () => {
    const { pool, consultas } = rpsVacio();
    getPool.mockResolvedValue(pool);
    const { precalentarMetricas, leerNcPeriodo, leerPasesRps, leerIncidenciasMetricas } = await modulos();

    await precalentarMetricas();
    const alArrancar = consultas.length;
    // Las NC usan dos consultas SQL; las demás fuentes, una cada una.
    expect(alArrancar).toBe(5);

    // Lo mismo que pide /api/metricas para las gráficas del año.
    const anio = periodoAnioRps("2026", HOY);
    expect(await leerNcPeriodo(anio, { disco: true })).toEqual([]);
    expect(await leerPasesRps(anio, "ot")).toEqual([]);
    expect(await leerIncidenciasMetricas(anio, "ot")).toEqual([]);
    expect(await leerIncidenciasMetricas(anio, "diseno")).toEqual([]);
    expect(consultas.length).toBe(alArrancar);
  });

  it("si RPS no contesta no revienta, y quien abra Métricas lo vuelve a pedir", async () => {
    getPool.mockRejectedValue(new Error("RPS no contesta"));
    const { precalentarMetricas, leerNcPeriodo } = await modulos();

    await expect(precalentarMetricas()).resolves.toBeUndefined();

    const { pool, consultas } = rpsVacio();
    getPool.mockResolvedValue(pool);
    expect(await leerNcPeriodo(periodoAnioRps("2026", HOY), { disco: true })).toEqual([]);
    expect(consultas.length).toBeGreaterThan(0);
  });

  // En el servidor tardaban cinco veces más que solas (16/11/2026) y el log no
  // decía por qué: si RPS iba lento o si no quedaban conexiones libres.
  it("el log dice cómo de ocupadas estaban las conexiones mientras esperaba", async () => {
    const { pool } = rpsVacio();
    getPool.mockResolvedValue({ ...pool, borrowed: 5, pending: 3 });
    const { precalentarMetricas } = await modulos();

    await precalentarMetricas();

    const lineas = vi.mocked(console.info).mock.calls.map((c) => String(c[0]));
    expect(lineas).toHaveLength(4);
    for (const linea of lineas) expect(linea).toContain("hasta 5 conexiones ocupadas y 3 consultas en cola");
  });

  it("con datos de prueba no se pide nada a RPS", async () => {
    process.env.DATASOURCE = "mock";
    const { precalentarMetricas } = await modulos();

    await precalentarMetricas();

    expect(getPool).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("programa un solo refresco horario y solo vuelve a pedir las NC al cambiar de periodo", async () => {
    vi.setSystemTime(new Date(2026, 10, 16, 22, 30));
    const { pool, consultas } = rpsVacio();
    getPool.mockResolvedValue(pool);
    const { precalentarMetricas } = await modulos();

    await Promise.all([precalentarMetricas(), precalentarMetricas()]);
    await precalentarMetricas();
    expect(vi.getTimerCount()).toBe(1);
    expect(consultas).toHaveLength(5);
    const fuentes = consultas.map((c) => c.texto);

    // Cada hora, solo las incidencias: las OF pasadas esperan a caducar.
    await vi.advanceTimersByTimeAsync(HORA);
    expect(consultas.slice(5).map((c) => c.texto)).toEqual(fuentes.slice(3));
    expect(consultas[6].parametros.hasta).toBe(HOY);

    // Al cambiar de día, también las NC; las OF pasadas siguen sin pedirse.
    await vi.advanceTimersByTimeAsync(HORA);
    expect(consultas.slice(7).map((c) => c.texto)).toEqual([...fuentes.slice(0, 2), ...fuentes.slice(3)]);
    expect(consultas[7].parametros.hasta).toBe("2026-11-17");
    expect(consultas[9].parametros.hasta).toBe("2026-11-17");
    expect(consultas[10].parametros.hasta).toBe("2026-11-17");
  });

  it("mantiene las consultas en serie y omite una vuelta si la anterior sigue en curso", async () => {
    let liberar!: () => void;
    const pendiente = new Promise<void>((resolver) => { liberar = resolver; });
    const { pool, consultas } = rpsVacio((n) => n === 6 ? pendiente : undefined);
    getPool.mockResolvedValue(pool);
    const { precalentarMetricas } = await modulos();

    await precalentarMetricas();
    await vi.advanceTimersByTimeAsync(HORA);
    expect(consultas).toHaveLength(6);
    await vi.advanceTimersByTimeAsync(HORA);
    expect(consultas).toHaveLength(6);

    liberar();
    await vi.advanceTimersByTimeAsync(0);
    expect(consultas).toHaveLength(7);
    await vi.advanceTimersByTimeAsync(HORA);
    expect(consultas).toHaveLength(9);
  });

  it("guarda las NC de Métricas 24 horas y las de Rectificados diez minutos", async () => {
    const inicio = Date.now();
    let liberar!: () => void;
    const pendiente = new Promise<void>((resolver) => { liberar = resolver; });
    const { pool, consultas } = rpsVacio((n) => n === 5 ? pendiente : undefined);
    getPool.mockResolvedValue(pool);
    const { leerNcPeriodo } = await modulos();
    const anio = periodoAnioRps("2026", HOY);
    const metricas = { disco: true, esperarRps: true };

    await leerNcPeriodo(anio, metricas);
    await leerNcPeriodo(anio);
    vi.setSystemTime(inicio + 10 * 60_000 - 1);
    await leerNcPeriodo(anio);
    expect(consultas).toHaveLength(4);
    vi.setSystemTime(inicio + 10 * 60_000);
    const rectificados = leerNcPeriodo(anio);
    const termino = vi.fn();
    void rectificados.then(termino);
    await leerNcPeriodo(anio, metricas);
    expect(consultas).toHaveLength(5);
    expect(termino).not.toHaveBeenCalled();
    liberar();
    await rectificados;

    vi.setSystemTime(inicio + 24 * HORA - 1);
    await leerNcPeriodo(anio, metricas);
    expect(consultas).toHaveLength(6);
    vi.setSystemTime(inicio + 24 * HORA);
    await leerNcPeriodo(anio, metricas);
    expect(consultas).toHaveLength(8);
  });
});
