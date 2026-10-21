import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ofsARecuperar = vi.fn();
const invalidarCacheTablero = vi.fn();
vi.mock("@/lib/server/recuperar-pedido", () => ({ ofsARecuperar: (p: string, s: string) => ofsARecuperar(p, s) }));
vi.mock("@/lib/server/historial-db", () => ({ leerEntregaPedido: async () => ({ pendienteEntrega: false, fechaEntregado: null }) }));
vi.mock("@/lib/server/rps", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  invalidarCacheTablero: (s: string) => invalidarCacheTablero(s),
}));
// Ni RPS ni OLANET: devolver al Historial solo escribe en CoordinaOT.
vi.mock("@/lib/server/db", () => ({ getPool: async () => { throw new Error("sin RPS en tests"); } }));
const olanetLlamado = vi.fn();
vi.mock("@/lib/server/olanet", () => new Proxy({}, {
  get: (_t, nombre) => (...args: unknown[]) => { olanetLlamado(String(nombre), args); throw new Error("sin OLANET en tests"); },
}));

let dir: string;
let recuperar: typeof import("../../app/api/historial/[pedido]/recuperar/route");
let devolver: typeof import("../../app/api/historial/[pedido]/devolver/route");
let estadoDb: typeof import("../server/estado-db");
let overlayMod: typeof import("../server/overlay");

const PEDIDO = "AR.26.04890";
const OFS = ["0232762:5", "0232764:1"];

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-devolver-ruta-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.DATASOURCE = "rps";
});
afterAll(() => {
  delete process.env.DATASOURCE;
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows/WAL: best effort */ }
});

beforeEach(async () => {
  vi.clearAllMocks();
  delete process.env.COORDINA_LOGIN;
  estadoDb = await import("../server/estado-db");
  overlayMod = await import("../server/overlay");
  const dataMod = await import("../data");
  estadoDb.getDb().exec("DELETE FROM of_overlay; DELETE FROM of_retenida; DELETE FROM pedido_paso_seccion; DELETE FROM acciones_log;");
  vi.spyOn(dataMod, "getTablero").mockResolvedValue({ pedidos: [], operarios: [] } as never);
  ofsARecuperar.mockResolvedValue([
    { ofId: OFS[0], codigo: "0232762", descripcion: "Toldo", autorId: "ivan", fichable: true },
    { ofId: OFS[1], codigo: "0232764", descripcion: "Lona", autorId: "ivan", fichable: true },
  ]);
  recuperar = await import("../../app/api/historial/[pedido]/recuperar/route");
  devolver = await import("../../app/api/historial/[pedido]/devolver/route");
});
afterEach(() => {
  vi.resetModules();
});

const pedir = <T extends { POST: (r: Request, c: { params: Promise<{ pedido: string }> }) => Promise<Response> }>(
  ruta: T, accion: string, body: unknown,
) => ruta.POST(
  new Request(`http://x/api/historial/${PEDIDO}/${accion}`, { method: "POST", body: JSON.stringify(body) }),
  { params: Promise.resolve({ pedido: PEDIDO }) },
);

/** Planteado por Iván, revisado por Jaime y pasado. */
function pasado() {
  estadoDb.guardarMutacion({
    operarioId: "ivan", motivo: "aprobar", seccion: "ot",
    cambiosOF: OFS.map((ofId) => ({ ofId, autorId: "ivan", revisorId: "jaime", estado: "aprobada" as const, observacion: null })),
  });
  estadoDb.guardarMutacion({ operarioId: "ivan", motivo: "pasar", seccion: "ot", completarPedidoId: PEDIDO, ofIdsPedido: OFS });
}

/** El pedido tal como lo vería el tablero, con el overlay encima. */
function enTablero() {
  const tablero = {
    operarios: [],
    pedidos: [{ id: PEDIDO, codigo: PEDIDO, situacion: "procesado", ofs: OFS.map((id) => ({ id, estado: "pendiente", detenida: true })) }],
  };
  return overlayMod.aplicarOverlay(tablero as never, estadoDb.leerOverlay("ot")).pedidos[0];
}

test("recuperado: el tablero lo marca, y devolverlo lo deja como estaba al pasarlo", async () => {
  pasado();
  expect((await pedir(recuperar, "recuperar", { ofIds: [OFS[0]], seccion: "ot", operarioId: "ivan" })).status).toBe(200);
  expect(enTablero()).toEqual(expect.objectContaining({ situacion: "procesado", recuperado: true }));

  const res = await pedir(devolver, "devolver", { seccion: "ot", operarioId: "ivan" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });

  const ofs = estadoDb.leerOverlay("ot").ofs;
  for (const id of OFS)
    expect(ofs.get(id)).toEqual(expect.objectContaining({ estado: "aprobada", autorId: "ivan", revisorId: "jaime" }));
  expect(estadoDb.leerOfsRetenidas("ot")).toEqual([]);
  expect(estadoDb.leerPedidosPasados("ot").get(PEDIDO)?.ofIds).toEqual(OFS);
  const p = enTablero();
  expect(p.situacion).toBe("completado");
  expect(p.recuperado).toBeUndefined();
  expect(olanetLlamado).not.toHaveBeenCalled();
  expect(invalidarCacheTablero).toHaveBeenCalledWith("ot");
});

test("después se puede volver a recuperar", async () => {
  pasado();
  await pedir(recuperar, "recuperar", { ofIds: OFS, seccion: "ot", operarioId: "ivan" });
  await pedir(devolver, "devolver", { seccion: "ot", operarioId: "ivan" });
  const res = await pedir(recuperar, "recuperar", { ofIds: OFS, seccion: "ot", operarioId: "ivan" });
  expect(await res.json()).toEqual({ ok: true, yaEstaba: false });
});

test("un pedido que no se ha recuperado no se toca", async () => {
  pasado();
  const res = await pedir(devolver, "devolver", { seccion: "ot", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect(estadoDb.leerOverlay("ot").ofs.get(OFS[0])?.estado).toBe("aprobada");
});

test("código de pedido raro: 400 sin tocar nada", async () => {
  const res = await devolver.POST(
    new Request("http://x/api/historial/x/devolver", { method: "POST", body: "{}" }),
    { params: Promise.resolve({ pedido: "nada'; --" }) },
  );
  expect(res.status).toBe(400);
});
