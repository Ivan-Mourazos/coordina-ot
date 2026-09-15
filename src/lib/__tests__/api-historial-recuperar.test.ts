import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ofsARecuperar = vi.fn();
const leerEntregaPedido = vi.fn();
const invalidarCacheTablero = vi.fn();
vi.mock("@/lib/server/recuperar-pedido", () => ({ ofsARecuperar: (p: string, s: string) => ofsARecuperar(p, s) }));
vi.mock("@/lib/server/historial-db", () => ({ leerEntregaPedido: (p: string, s: string) => leerEntregaPedido(p, s) }));
vi.mock("@/lib/server/rps", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  invalidarCacheTablero: (s: string) => invalidarCacheTablero(s),
}));
// Ni RPS ni OLANET de verdad: si algún camino de la ruta intentara abrir una
// conexión, el test lo diría en vez de salir a la red.
vi.mock("@/lib/server/db", () => ({ getPool: async () => { throw new Error("sin RPS en tests"); } }));
const olanetLlamado = vi.fn();
vi.mock("@/lib/server/olanet", () => new Proxy({}, {
  get: (_t, nombre) => (...args: unknown[]) => { olanetLlamado(String(nombre), args); throw new Error("sin OLANET en tests"); },
}));

let dir: string;
let ruta: typeof import("../../app/api/historial/[pedido]/recuperar/route");
let dataMod: typeof import("../data");
let estadoDb: typeof import("../server/estado-db");

const PEDIDO_FUERA_DEL_PANEL = { pedidos: [] as unknown[], operarios: [] };

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-recuperar-ruta-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  // Como en producción: la caché del tablero solo existe con RPS de verdad, y
  // la ruta solo la invalida entonces. Todo lo que tocaría RPS está simulado.
  process.env.DATASOURCE = "rps";
});
afterAll(() => {
  delete process.env.DATASOURCE;
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows/WAL: best effort */ }
});

beforeEach(async () => {
  vi.clearAllMocks();
  // Se importan aquí y no en beforeAll: `resetModules` (afterEach) hace que la
  // ruta cargue módulos nuevos, y un espía sobre el `getTablero` de la carga
  // anterior no lo vería.
  estadoDb = await import("../server/estado-db");
  dataMod = await import("../data");
  estadoDb.getDb().exec("DELETE FROM of_overlay; DELETE FROM of_retenida; DELETE FROM pedido_paso_seccion; DELETE FROM olanet_pendiente;");
  vi.spyOn(dataMod, "getTablero").mockResolvedValue(PEDIDO_FUERA_DEL_PANEL as never);
  ofsARecuperar.mockResolvedValue([
    { ofId: "0232086:9", codigo: "0232086", descripcion: "Toldo cofre", autorId: "ivan", fichable: true },
    { ofId: "0232087:9", codigo: "0232087", descripcion: "Pérgola", autorId: null, fichable: true },
  ]);
  leerEntregaPedido.mockResolvedValue({ pendienteEntrega: false, fechaEntregado: "2026-09-12" });
  ruta = await import("../../app/api/historial/[pedido]/recuperar/route");
});
afterEach(() => vi.resetModules());

const get = (pedido: string) =>
  ruta.GET(new Request(`http://x/api/historial/${pedido}/recuperar`), { params: Promise.resolve({ pedido }) });
const post = (pedido: string, body: unknown) =>
  ruta.POST(new Request(`http://x/api/historial/${pedido}/recuperar`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ pedido }) });

test("GET devuelve las OF, si está entregado y desde cuándo", async () => {
  const res = await get("AR.26.04351");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    ofs: [
      { ofId: "0232086:9", codigo: "0232086", descripcion: "Toldo cofre", autorId: "ivan", fichable: true },
      { ofId: "0232087:9", codigo: "0232087", descripcion: "Pérgola", autorId: null, fichable: true },
    ],
    entregado: true,
    fechaEntregado: "2026-09-12",
  });
});

test("GET con RPS caído es 503 y lo dice", async () => {
  ofsARecuperar.mockRejectedValue(new Error("timeout"));
  const res = await get("AR.26.04351");
  expect(res.status).toBe(503);
  expect((await res.json()).error).toMatch(/No se ha tocado nada/);
});

test("GET con un código de pedido raro es 400 y no consulta nada", async () => {
  const res = await get("DROP TABLE");
  expect(res.status).toBe(400);
  expect(ofsARecuperar).not.toHaveBeenCalled();
});

test("POST: sin marcar ninguna es 400", async () => {
  const res = await post("AR.26.04351", { operarioId: "tamara", ofIds: [] });
  expect(res.status).toBe(400);
});

test("POST: una OF que no está en la lista real es 400", async () => {
  const res = await post("AR.26.04351", { operarioId: "tamara", ofIds: ["9999999:1"] });
  expect(res.status).toBe(400);
  expect(estadoDb.leerOverlay("ot").ofs.size).toBe(0);
});

test("POST: si el pedido ya está en el panel (no completado), 409", async () => {
  vi.spyOn(dataMod, "getTablero").mockResolvedValue({
    operarios: [], pedidos: [{ id: "AR.26.04351", codigo: "AR.26.04351", situacion: "procesado", ofs: [] }],
  } as never);
  const res = await post("AR.26.04351", { operarioId: "tamara", ofIds: ["0232086:9"] });
  expect(res.status).toBe(409);
});

test("POST: recupera las marcadas en_curso (con autor propio o quien recupera) y deja aprobadas las demás", async () => {
  const res = await post("AR.26.04351", { operarioId: "tamara", ofIds: ["0232086:9"] });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, yaEstaba: false });

  const overlay = estadoDb.leerOverlay("ot");
  expect(overlay.ofs.get("0232086:9")).toEqual(expect.objectContaining({ estado: "en_curso", autorId: "ivan" }));
  expect(overlay.ofs.get("0232087:9")).toEqual(expect.objectContaining({ estado: "aprobada", autorId: null }));

  const retenidas = estadoDb.leerOfsRetenidas("ot");
  expect(retenidas.find((r) => r.ofId === "0232086:9")?.motivo).toBe("recuperada");
  expect(retenidas.find((r) => r.ofId === "0232087:9")?.motivo).toBe("del_pedido");
  expect(invalidarCacheTablero).toHaveBeenCalledWith("ot");
});

test("una OF SIN autor registrado que se marca queda a nombre de quien recupera", async () => {
  ofsARecuperar.mockResolvedValue([{ ofId: "0232087:9", codigo: "0232087", descripcion: "Pérgola", autorId: null, fichable: true }]);
  await post("AR.26.04351", { operarioId: "tamara", ofIds: ["0232087:9"] });
  expect(estadoDb.leerOverlay("ot").ofs.get("0232087:9")?.autorId).toBe("tamara");
});

test("una marcada con fila conserva autor, revisor y `revisada`; la sin marcar sigue como estaba", async () => {
  // Historia real: Iván la planteó, Jaime la revisó y quedó aprobada.
  estadoDb.guardarMutacion({
    operarioId: "jaime", motivo: "empezar_revision",
    cambiosOF: [{ ofId: "0232086:9", autorId: "ivan", revisorId: "jaime", estado: "en_revision", observacion: null }],
  });
  estadoDb.guardarMutacion({
    operarioId: "jaime", motivo: "aprobar",
    cambiosOF: [
      { ofId: "0232086:9", autorId: "ivan", revisorId: "jaime", estado: "aprobada", observacion: "ok" },
      { ofId: "0232087:9", autorId: "ivan", revisorId: "jaime", estado: "aprobada", observacion: null },
    ],
  });
  await post("AR.26.04351", { operarioId: "tamara", ofIds: ["0232086:9"] });
  const ofs = estadoDb.leerOverlay("ot").ofs;
  expect(ofs.get("0232086:9")).toEqual(expect.objectContaining({
    estado: "en_curso", autorId: "ivan", revisorId: "jaime", observacion: "ok", revisada: true,
  }));
  expect(ofs.get("0232087:9")).toEqual(expect.objectContaining({ estado: "aprobada", autorId: "ivan", revisorId: "jaime" }));
});

test("recuperar dos veces contesta yaEstaba y no cambia nada la segunda vez", async () => {
  await post("AR.26.04351", { operarioId: "tamara", ofIds: ["0232086:9"] });
  const antes = estadoDb.leerOverlay("ot").ofs.get("0232086:9");
  const res = await post("AR.26.04351", { operarioId: "jaime", ofIds: ["0232087:9"] });
  expect(await res.json()).toEqual({ ok: true, yaEstaba: true });
  expect(estadoDb.leerOverlay("ot").ofs.get("0232086:9")).toEqual(antes);
});

test("recuperar no escribe nada en OLANET: ni llamadas ni eventos en la cola", async () => {
  await post("AR.26.04351", { operarioId: "tamara", ofIds: ["0232086:9", "0232087:9"] });
  expect(olanetLlamado).not.toHaveBeenCalled();
  const enCola = estadoDb.getDb().prepare("SELECT COUNT(*) AS n FROM olanet_pendiente").get() as { n: number };
  expect(enCola.n).toBe(0);
});
