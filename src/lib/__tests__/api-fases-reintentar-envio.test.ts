import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// «Reintentar envío» (spec 2026-09-15, «Confirmado con Iván» punto 5): vuelve
// a poner en la cola los eventos DESCARTADOS de una orden/operación,
// reiniciando sus intentos. NO escribe en OLANET por sí misma: solo intenta
// drenar la cola después, con las mismas reglas de siempre (modoFichaje).
const insertarBono = vi.fn();
const moverFase = vi.fn();
vi.mock("@/lib/server/olanet", () => ({
  insertarBono: (b: unknown) => insertarBono(b),
  moverFase: (o: unknown) => moverFase(o),
  buscarIdBoletin: async () => "900",
  estadoDeFase: async () => 2,
}));
vi.mock("@/lib/server/operarios", () => ({
  COD_RPS_POR_OPERARIO: { ivan: "195", tamara: "180" },
  MAQUINA_POR_OPERARIO: {},
  seccionDeOperario: () => "ot",
}));

let dir: string;
let ruta: typeof import("../../app/api/fases/cerrar-of/reintentar-envio/route");
let estadoDb: typeof import("../server/estado-db");
let outbox: typeof import("../server/olanet-outbox");
let dataMod: typeof import("../data");

const PEDIDO = {
  id: "AR.26.04351", codigo: "AR.26.04351", cliente: "MAHOU", situacion: "procesado" as const,
  fechaSolicitud: "2026-09-01", fechaPlanificacion: "2026-09-01", fechaEntrega: "2026-09-20",
  prioridad: 2 as const, accent: "ninguno" as const, lineas: 1, croquis: false,
  ofs: [
    { id: "0232086:9", codigo: "0232086", descripcion: "Toldo cofre", familia: "TOLDO" as const, piezas: 1,
      autorId: "ivan", revisorId: null, estado: "aprobada" as const, fichandoRol: null,
      tiempoEstimadoMin: 0, tiempoPlanteoMin: 30, tiempoRevisionMin: 0 },
  ],
};

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-reintentar-envio-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.DATASOURCE = "mock";
});
afterAll(() => {
  delete process.env.DATASOURCE;
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows/WAL: best effort */ }
});

beforeEach(async () => {
  vi.clearAllMocks();
  estadoDb = await import("../server/estado-db");
  outbox = await import("../server/olanet-outbox");
  dataMod = await import("../data");
  process.env.FICHAJE_OLANET = "activo";
  estadoDb.getDb().exec("DELETE FROM of_overlay; DELETE FROM of_retenida; DELETE FROM olanet_pendiente; DELETE FROM fichaje_intervalo; DELETE FROM olanet_watermark;");
  vi.spyOn(dataMod, "getTablero").mockResolvedValue({ operarios: [], pedidos: [PEDIDO] });
  insertarBono.mockResolvedValue(undefined);
  moverFase.mockResolvedValue(undefined);
  ruta = await import("../../app/api/fases/cerrar-of/reintentar-envio/route");
});
afterEach(() => vi.resetModules());

const post = (body: unknown) =>
  ruta.POST(new Request("http://x/api/fases/cerrar-of/reintentar-envio", { method: "POST", body: JSON.stringify(body) }));

test("solo el autor puede reintentar el envío; otro técnico recibe 403", async () => {
  const res = await post({ ofId: "0232086:9", operarioId: "tamara" });
  expect(res.status).toBe(403);
});

test("OF no encontrada: 404", async () => {
  const res = await post({ ofId: "0299999:9", operarioId: "ivan" });
  expect(res.status).toBe(404);
});

test("sin nada descartado, contesta bien y no rompe nada (reencolados: 0)", async () => {
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(200);
  const d = await res.json();
  expect(d).toEqual(expect.objectContaining({ ok: true, reencolados: 0 }));
});

test("un evento DESCARTADO de esa orden/operación vuelve a la cola con los intentos a cero", async () => {
  outbox.encolarFichaje("ivan", [{ inicio: "2026-09-15T08:00:00.000Z", fin: "2026-09-15T08:30:00.000Z", ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }]);
  const bono = outbox.leerPendientes().find((p) => p.tipo === "bono" && p.datos.of === "0232086")!;
  outbox.marcarError(bono.id, "RPS no contesta");
  outbox.descartar(bono.id, "5 intentos fallidos — RPS no contesta");
  expect(outbox.sinLlegarAOlanet("0232086", "9").descartados).toBe(1);

  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(200);
  const d = await res.json();
  expect(d).toEqual(expect.objectContaining({ ok: true, reencolados: 1 }));
  expect(outbox.sinLlegarAOlanet("0232086", "9").descartados).toBe(0);
});

test("no escribe nada en OLANET por sí misma: la escritura la hace la cola de siempre", async () => {
  outbox.encolarFichaje("ivan", [{ inicio: "2026-09-15T09:00:00.000Z", fin: "2026-09-15T09:30:00.000Z", ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }]);
  const bono = outbox.leerPendientes().find((p) => p.tipo === "bono" && p.datos.of === "0232086")!;
  outbox.descartar(bono.id, "5 intentos fallidos");
  await post({ ofId: "0232086:9", operarioId: "ivan" });
  // El bono reencolado se drena con las reglas normales (activo, insertarBono
  // mockeado en éxito): puede haberse enviado ya, pero eso lo hace `drenarCola`,
  // no la ruta a mano — por eso se comprueba a través de la cola, no de un
  // "escribirBono" propio de esta ruta.
  expect(outbox.leerCola().find((p) => p.id === bono.id)?.enviadoAt).not.toBeNull();
});

test("respeta el modo de fichaje: en sombra, reencola pero no llega a escribirse", async () => {
  outbox.encolarFichaje("ivan", [{ inicio: "2026-09-15T10:00:00.000Z", fin: "2026-09-15T10:30:00.000Z", ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }]);
  const bono = outbox.leerPendientes().find((p) => p.tipo === "bono" && p.datos.of === "0232086")!;
  outbox.descartar(bono.id, "5 intentos fallidos");
  delete process.env.FICHAJE_OLANET;
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(200);
  expect(insertarBono).not.toHaveBeenCalled();
  expect(outbox.leerPendientes().some((p) => p.id === bono.id)).toBe(true);
});
