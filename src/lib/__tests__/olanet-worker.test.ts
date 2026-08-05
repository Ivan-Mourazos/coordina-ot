import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Intervalo } from "../fichaje";

// El acceso a OLANET se sustituye: aquí se prueba la lógica del worker (orden,
// reintentos, descarte), no la conexión a SQL Server.
const insertarBono = vi.fn<(...a: unknown[]) => Promise<void>>();
const moverFase = vi.fn<(...a: unknown[]) => Promise<void>>();
const buscarIdBoletin = vi.fn<(...a: unknown[]) => Promise<string | null>>();
const sincronizarFichajeEnCurso = vi.fn<(...a: unknown[]) => Promise<void>>();

vi.mock("../server/olanet", () => ({
  insertarBono: (...a: unknown[]) => insertarBono(...a),
  moverFase: (...a: unknown[]) => moverFase(...a),
  buscarIdBoletin: (...a: unknown[]) => buscarIdBoletin(...a),
  sincronizarFichajeEnCurso: (...a: unknown[]) => sincronizarFichajeEnCurso(...a),
}));

let dir: string;
let worker: typeof import("../server/olanet-worker");
let outbox: typeof import("../server/olanet-outbox");
let estadoDb: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-worker-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  outbox = await import("../server/olanet-outbox");
  estadoDb = await import("../server/estado-db");
  worker = await import("../server/olanet-worker");
});

afterAll(() => {
  delete process.env.FICHAJE_OLANET;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

beforeEach(() => {
  insertarBono.mockReset().mockResolvedValue(undefined);
  moverFase.mockReset().mockResolvedValue(undefined);
  buscarIdBoletin.mockReset().mockResolvedValue("4063655");
  sincronizarFichajeEnCurso.mockReset().mockResolvedValue(undefined);
});

const iv = (inicio: string, fin: string | null, ofIds: string[], operarioId: string): Intervalo => ({
  inicio,
  fin,
  ofIds,
  rol: "plantear",
  operarioId,
});

describe("modo sombra", () => {
  it("no escribe NADA en OLANET", async () => {
    delete process.env.FICHAJE_OLANET;
    outbox.encolarFichaje("ivan", [
      iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["0230344:2"], "ivan"),
    ]);
    expect(await worker.drenarCola()).toBe(0);
    await worker.refrescarEnCurso();
    expect(insertarBono).not.toHaveBeenCalled();
    expect(moverFase).not.toHaveBeenCalled();
    expect(sincronizarFichajeEnCurso).not.toHaveBeenCalled();
    // Y lo encolado sigue pendiente, listo para cuando se active.
    expect(outbox.leerPendientes().length).toBeGreaterThan(0);
  });
});

describe("drenarCola en modo activo", () => {
  beforeEach(() => {
    process.env.FICHAJE_OLANET = "activo";
  });

  it("envía en orden y vacía la cola", async () => {
    const enviados = await worker.drenarCola();
    expect(enviados).toBe(3); // 1 bono + 2 movimientos de fase
    expect(insertarBono).toHaveBeenCalledTimes(1);
    expect(moverFase).toHaveBeenCalledTimes(2);
    expect(outbox.leerPendientes()).toHaveLength(0);
  });

  it("al fallar uno se para y no adelanta los de detrás", async () => {
    outbox.encolarFichaje("jaime", [
      iv("2026-08-03T09:00:00Z", "2026-08-03T09:30:00Z", ["0230400:1"], "jaime"),
    ]);
    insertarBono.mockRejectedValueOnce(new Error("conexión rechazada"));

    expect(await worker.drenarCola()).toBe(0);
    expect(moverFase).not.toHaveBeenCalled(); // el bono va primero: nadie se cuela
    const pendiente = outbox.leerPendientes()[0];
    expect(pendiente.error).toBe("conexión rechazada");
    expect(pendiente.intentos).toBe(1);
  });

  it("al volver la conexión reanuda desde donde se quedó", async () => {
    expect(await worker.drenarCola()).toBe(3);
    expect(outbox.leerPendientes()).toHaveLength(0);
  });

  it("descarta la fase que OLANET no tiene, sin bloquear la cola", async () => {
    outbox.encolarFichaje("tamara", [
      iv("2026-08-03T10:00:00Z", "2026-08-03T10:30:00Z", ["0230500:9"], "tamara"),
    ]);
    buscarIdBoletin.mockResolvedValue(null);

    await worker.drenarCola();
    expect(outbox.leerPendientes()).toHaveLength(0); // no queda nada atascado
    const descartados = outbox.leerCola().filter((p) => p.error?.startsWith("DESCARTADO"));
    expect(descartados.length).toBeGreaterThan(0);
    expect(descartados[0].error).toContain("0230500/9");
  });

  it("tras varios fallos seguidos descarta en vez de atascarse para siempre", async () => {
    outbox.encolarFichaje("adrian", [
      iv("2026-08-03T11:00:00Z", "2026-08-03T11:30:00Z", ["0230600:1"], "adrian"),
    ]);
    insertarBono.mockRejectedValue(new Error("dato inválido"));

    for (let i = 0; i < 5; i++) await worker.drenarCola();

    const bono = outbox.leerCola().find((p) => p.tipo === "bono" && p.datos.of === "0230600")!;
    expect(bono.enviadoAt).not.toBeNull();
    expect(bono.error).toContain("DESCARTADO");
  });
});

describe("modo ensayo", () => {
  // Los tests anteriores ya dejaron marca de procesado para estos operarios;
  // se limpia para que la lista corta que se manda aquí se derive entera.
  const desdeCero = (operarioId: string) => {
    estadoDb.getDb().prepare("DELETE FROM olanet_watermark WHERE operario_id = ?").run(operarioId);
  };

  it("escribe en las tablas reales pero marca el bono como no procesable", async () => {
    process.env.FICHAJE_OLANET = "ensayo";
    desdeCero("jaime");
    outbox.encolarFichaje("jaime", [
      iv("2026-08-04T08:00:00Z", "2026-08-04T08:30:00Z", ["0231000:5"], "jaime"),
    ]);
    await worker.drenarCola();

    const escrito = insertarBono.mock.calls.at(-1)?.[0] as { of: string; traspasado: number };
    expect(escrito.of).toBe("0231000");
    // 2 = estado interno de OLANET "ya pasado": su proceso no lo recoge, así
    // que el tiempo no sube a RPS aunque la fila esté en la tabla buena.
    expect(escrito.traspasado).toBe(2);
    // Los movimientos de fase NO se escriben: no hay forma de neutralizarlos y
    // dejarían una OF real marcada como finalizada para Producción.
    expect(moverFase).not.toHaveBeenCalled();
    const descartados = outbox.leerCola().filter((p) => p.error?.includes("ensayo:"));
    expect(descartados.length).toBeGreaterThan(0);
    delete process.env.FICHAJE_OLANET;
  });

  it("en ensayo no toca la tabla de fichaje vivo, que comparte con el mini-olanet", async () => {
    process.env.FICHAJE_OLANET = "ensayo";
    await worker.refrescarEnCurso();
    expect(sincronizarFichajeEnCurso).not.toHaveBeenCalled();
    delete process.env.FICHAJE_OLANET;
  });

  it("en activo el bono va como pendiente de traspasar", async () => {
    process.env.FICHAJE_OLANET = "activo";
    desdeCero("tamara");
    outbox.encolarFichaje("tamara", [
      iv("2026-08-04T09:00:00Z", "2026-08-04T09:30:00Z", ["0231001:5"], "tamara"),
    ]);
    await worker.drenarCola();

    const escrito = insertarBono.mock.calls.at(-1)?.[0] as { traspasado: number };
    expect(escrito.traspasado).toBe(0);
    delete process.env.FICHAJE_OLANET;
  });
});
