import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MovimientoRegistrado } from "../metricas";
import type { FilaFamilia } from "../server/metricas-fuentes";

const getPool = vi.hoisted(() => vi.fn());
vi.mock("../server/db", () => ({ getPool }));

function simularRps(buscar: (ordenes: string[]) => FilaFamilia[] | Promise<FilaFamilia[]>) {
  const consultas = vi.fn(buscar);
  getPool.mockResolvedValue({
    request() {
      const ordenes: string[] = [];
      const peticion = {
        input(_nombre: string, _tipo: unknown, orden: string) { ordenes.push(orden); return peticion; },
        async query() { return { recordset: await consultas(ordenes) }; },
      };
      return peticion;
    },
  });
  return consultas;
}

const movimiento = (ofId: string): MovimientoRegistrado => ({
  ofId, at: "2026-11-16T09:00:00Z", motivo: "terminar_planteo", observacion: null,
});
const fila = (orden: string, grupo = "GRUPO"): FilaFamilia => ({
  orden, grupo, descripcion: null, cliente: null, subfamilia: null,
});

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DATASOURCE", "rps");
  getPool.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("familias de Métricas", () => {
  it("comparte la familia entre fases y pide a RPS solo los números de OF que faltan", async () => {
    const consultas = simularRps((ordenes) => ordenes.map((orden) => fila(`${orden} `)));
    const { leerFamiliasMetricas } = await import("../server/metricas-fuentes");

    await expect(leerFamiliasMetricas([movimiento("123:10"), movimiento("123:20")]))
      .resolves.toEqual(new Map([["123:10", "GRUPO"], ["123:20", "GRUPO"]]));
    await expect(leerFamiliasMetricas([movimiento("123:30"), movimiento("456:10"), movimiento("pedido")]))
      .resolves.toEqual(new Map([["123:30", "GRUPO"], ["456:10", "GRUPO"]]));
    await expect(leerFamiliasMetricas([movimiento("456:20")]))
      .resolves.toEqual(new Map([["456:20", "GRUPO"]]));
    expect(consultas.mock.calls).toEqual([[["123"]], [["456"]]]);
  });

  it("al cabo de seis horas sirve la familia guardada mientras se actualiza una sola vez", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const consultas = simularRps((ordenes) => ordenes.map((orden) => fila(orden, "ANTERIOR")));
    const { leerFamiliasMetricas } = await import("../server/metricas-fuentes");
    const movs = [movimiento("123:10")];
    await leerFamiliasMetricas(movs);
    vi.setSystemTime(Date.now() + 6 * 3_600_000 - 1);
    await expect(leerFamiliasMetricas(movs)).resolves.toEqual(new Map([["123:10", "ANTERIOR"]]));
    expect(consultas).toHaveBeenCalledTimes(1);

    let contestar!: (filas: FilaFamilia[]) => void;
    consultas.mockReturnValueOnce(new Promise((resolver) => { contestar = resolver; }));
    vi.setSystemTime(Date.now() + 1);
    await expect(leerFamiliasMetricas(movs)).resolves.toEqual(new Map([["123:10", "ANTERIOR"]]));
    await expect(leerFamiliasMetricas(movs)).resolves.toEqual(new Map([["123:10", "ANTERIOR"]]));
    expect(consultas).toHaveBeenCalledTimes(2);

    contestar([fila("123", "ACTUAL")]);
    await vi.waitFor(async () => {
      await expect(leerFamiliasMetricas(movs)).resolves.toEqual(new Map([["123:10", "ACTUAL"]]));
    });
    expect(consultas).toHaveBeenCalledTimes(2);
  });
});
