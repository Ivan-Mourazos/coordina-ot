import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { periodoAnioRps } from "../metricas";

const getPool = vi.hoisted(() => vi.fn());
vi.mock("../server/db", () => ({ getPool }));

// Lo que Métricas guarda de RPS (no conformidades y OF pasadas antes de
// Coordina) vivía solo en memoria: después de cada actualización de la web, el
// primero que abría Métricas volvía a esperar las dos consultas enteras. Al
// arrancar se piden ya, con el mismo periodo que pedirán las gráficas.

/** Un RPS que contesta a todo sin filas y apunta cuántas consultas recibe. */
function rpsVacio() {
  const consultas: string[] = [];
  const pool = {
    request() {
      const peticion = {
        input() { return peticion; },
        async query(texto: string) { consultas.push(texto); return { recordset: [] }; },
      };
      return peticion;
    },
  };
  return { pool, consultas };
}

/** Las cachés son del módulo: cada prueba arranca con las suyas vacías. */
async function modulos() {
  vi.resetModules();
  const { leerPasesRps } = await import("../server/metricas-fuentes");
  const { leerNcPeriodo } = await import("../server/nc-db");
  const { precalentarMetricas } = await import("../server/metricas-precalentar");
  return { leerPasesRps, leerNcPeriodo, precalentarMetricas };
}

const HOY = "2026-11-16";
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
  vi.useFakeTimers({ now: new Date(2026, 10, 16, 9, 0), toFake: ["Date"] });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  globalThis.__coordinaCacheEnDisco = undefined;
  if (rutaDeAntes === undefined) delete process.env.COORDINA_DB_PATH;
  else process.env.COORDINA_DB_PATH = rutaDeAntes;
  await rm(carpeta, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 });
  vi.restoreAllMocks();
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
    const { precalentarMetricas, leerNcPeriodo, leerPasesRps } = await modulos();

    await precalentarMetricas();
    const alArrancar = consultas.length;
    expect(alArrancar).toBeGreaterThan(0);

    // Lo mismo que pide /api/metricas para las gráficas del año.
    const anio = periodoAnioRps("2026", HOY);
    expect(await leerNcPeriodo(anio)).toEqual([]);
    expect(await leerPasesRps(anio, "ot")).toEqual([]);
    expect(consultas.length).toBe(alArrancar);
  });

  it("si RPS no contesta no revienta, y quien abra Métricas lo vuelve a pedir", async () => {
    getPool.mockRejectedValue(new Error("RPS no contesta"));
    const { precalentarMetricas, leerNcPeriodo } = await modulos();

    await expect(precalentarMetricas()).resolves.toBeUndefined();

    const { pool, consultas } = rpsVacio();
    getPool.mockResolvedValue(pool);
    expect(await leerNcPeriodo(periodoAnioRps("2026", HOY))).toEqual([]);
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
    expect(lineas).toHaveLength(2);
    for (const linea of lineas) expect(linea).toContain("hasta 5 conexiones ocupadas y 3 consultas en cola");
  });

  it("con datos de prueba no se pide nada a RPS", async () => {
    process.env.DATASOURCE = "mock";
    const { precalentarMetricas } = await modulos();

    await precalentarMetricas();

    expect(getPool).not.toHaveBeenCalled();
  });
});
