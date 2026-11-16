import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPool = vi.hoisted(() => vi.fn());
vi.mock("../server/db", () => ({ getPool }));

import type { IndiceHistorial } from "../historial-indice";
import { asegurarIndice, indiceSiListo, precalentarHistorial } from "../server/historial-indice";
import { guardarInstantanea, rutaInstantanea } from "../server/historial-instantanea";

// Cada actualización de la web reinicia el servidor. La lista del Historial
// vivía solo en memoria y rehacerla son minutos de RPS: hasta entonces el
// Historial no cargaba. Al arrancar se recupera la guardada en disco, y RPS no
// se toca hasta que caduca.

const MIN = 60_000;

const lista = (at: number): IndiceHistorial => ({
  at,
  base: {
    ot: [{ pedido: "AR.26.00001", fechaPedido: null, nOf: 1, fechaEntrega: null, pendienteEntrega: false, trabajoAbierto: false, fechaEntregado: null, tieneSeccion: true, pendienteSeccion: false, pendienteTotal: false, finalizada: at }],
    diseno: [],
    impresion: [],
  },
  info: new Map([["AR.26.00001", { cliente: "MAHOU, S.A.", negocio: null, ciudadEntrega: null, familias: ["Toldo"], ordenes: "0233185", textos: "MAHOU, S.A." }]]),
  personas: new Map(),
});

/** Un RPS que contesta a todo sin filas: la lista sale vacía, pero sale. */
function rpsVacio() {
  return {
    request() {
      const oyentes: Record<string, (x?: unknown) => void> = {};
      return {
        stream: false,
        input() { return this; },
        on(evento: string, oyente: (x?: unknown) => void) { oyentes[evento] = oyente; return this; },
        query() { setImmediate(() => oyentes.done?.()); },
        cancel() {},
      };
    },
  };
}

function apagar() {
  clearInterval(globalThis.__coordinaHistorialPrecalentado);
  globalThis.__coordinaHistorialPrecalentado = undefined;
  globalThis.__coordinaHistorialIndice = undefined;
  globalThis.__coordinaHistorialEnVuelo = undefined;
}

let carpeta: string;
const rutaDeAntes = process.env.COORDINA_DB_PATH;
beforeEach(() => {
  carpeta = mkdtempSync(path.join(os.tmpdir(), "coordina-arranque-"));
  process.env.COORDINA_DB_PATH = path.join(carpeta, "coordina.db");
  getPool.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  apagar();
  vi.restoreAllMocks();
  if (rutaDeAntes === undefined) delete process.env.COORDINA_DB_PATH;
  else process.env.COORDINA_DB_PATH = rutaDeAntes;
  rmSync(carpeta, { recursive: true, force: true });
});

describe("la lista del Historial al arrancar el servidor", () => {
  it("con una guardada reciente está al momento, sin consultar RPS", async () => {
    const at = Date.now() - 5 * MIN;
    await guardarInstantanea(lista(at), rutaInstantanea());

    precalentarHistorial();
    const indice = await asegurarIndice(5_000);

    expect(indice?.at).toBe(at);
    expect(indice?.base.ot.map((b) => b.pedido)).toEqual(["AR.26.00001"]);
    expect(indiceSiListo()).toBe(indice);
    expect(getPool).not.toHaveBeenCalled();
  });

  it("la recuperada se rehace cuando cumple la media hora, no al arrancar", async () => {
    getPool.mockRejectedValue(new Error("RPS no contesta"));
    await guardarInstantanea(lista(Date.now() - 20 * MIN), rutaInstantanea());
    const temporizador = vi.spyOn(globalThis, "setTimeout");

    precalentarHistorial();
    await asegurarIndice(5_000);

    // Le quedan diez minutos: ese es el único refresco programado.
    const esperas = temporizador.mock.calls.map((c) => Number(c[1] ?? 0)).filter((ms) => ms > MIN);
    expect(esperas).toHaveLength(1);
    expect(esperas[0]).toBeGreaterThan(9 * MIN);
    expect(esperas[0]).toBeLessThanOrEqual(10 * MIN);
    expect(getPool).not.toHaveBeenCalled();
  });

  it("con una guardada ya caducada, se sirve esa y se rehace por detrás", async () => {
    getPool.mockRejectedValue(new Error("RPS no contesta"));
    const at = Date.now() - 45 * MIN;
    await guardarInstantanea(lista(at), rutaInstantanea());

    precalentarHistorial();
    const indice = await asegurarIndice(5_000);

    expect(indice?.at).toBe(at);
    await vi.waitFor(() => expect(getPool).toHaveBeenCalled());
    // El refresco falló: se sigue sirviendo la que había.
    await vi.waitFor(() => expect(globalThis.__coordinaHistorialEnVuelo).toBeUndefined());
    expect(indiceSiListo()?.at).toBe(at);
  });

  it("sin ninguna guardada se construye contra RPS, como siempre", async () => {
    getPool.mockRejectedValue(new Error("RPS no contesta"));

    precalentarHistorial();

    expect(await asegurarIndice(5_000)).toBeNull();
    expect(getPool).toHaveBeenCalled();
  });

  it("lo construido se guarda, y el siguiente arranque ya no consulta RPS", async () => {
    getPool.mockResolvedValue(rpsVacio());
    precalentarHistorial();
    const construida = await asegurarIndice(5_000);
    expect(construida).not.toBeNull();
    expect(getPool).toHaveBeenCalled();
    await vi.waitFor(() => expect(existsSync(rutaInstantanea())).toBe(true));

    // Reinicio: la memoria se pierde, el disco no.
    apagar();
    getPool.mockReset();
    precalentarHistorial();
    const recuperada = await asegurarIndice(5_000);

    expect(recuperada?.at).toBe(construida?.at);
    expect(getPool).not.toHaveBeenCalled();
  });

  it("quien construye la lista sin arrancar el servidor no deja ficheros", async () => {
    getPool.mockResolvedValue(rpsVacio());

    expect(await asegurarIndice(5_000)).not.toBeNull();

    await new Promise((seguir) => setTimeout(seguir, 50));
    expect(existsSync(rutaInstantanea())).toBe(false);
  });
});
