import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// «Reintentar la N» (spec 2026-09-15, «Confirmado con Iván» punto 4): la OF ya
// está cerrada en RPS pero con una gemela 2/02 que no se pudo escribir, y este
// botón escribe SOLO esa. OLANET se simula por completo, igual que en
// api-fases-cerrar-of.test.ts.
const buscarIdBoletin = vi.fn();
const finalizarFase = vi.fn();
const insertarBono = vi.fn();
const moverFase = vi.fn();
vi.mock("@/lib/server/olanet", () => ({
  buscarIdBoletin: (of: string, fase: string) => buscarIdBoletin(of, fase),
  finalizarFase: (o: unknown) => finalizarFase(o),
  insertarBono: (b: unknown) => insertarBono(b),
  moverFase: (o: unknown) => moverFase(o),
}));
vi.mock("@/lib/server/operarios", () => ({
  COD_RPS_POR_OPERARIO: { ivan: "195", tamara: "180" },
  MAQUINA_POR_OPERARIO: {},
  seccionDeOperario: () => "ot",
}));

let dir: string;
let ruta: typeof import("../../app/api/fases/cerrar-of/reintentar-gemela/route");
let estadoDb: typeof import("../server/estado-db");
let dataMod: typeof import("../data");

const PEDIDO = {
  id: "AR.26.04351", codigo: "AR.26.04351", cliente: "MAHOU", situacion: "procesado" as const,
  fechaSolicitud: "2026-09-01", fechaPlanificacion: "2026-09-01", fechaEntrega: "2026-09-20",
  prioridad: 2 as const, accent: "ninguno" as const, lineas: 1, croquis: false,
  ofs: [
    { id: "0232086:9", codigo: "0232086", descripcion: "Toldo cofre", familia: "TOLDO" as const, piezas: 1,
      autorId: "ivan", revisorId: null, estado: "aprobada" as const, fichandoRol: null,
      tiempoEstimadoMin: 0, tiempoPlanteoMin: 30, tiempoRevisionMin: 0,
      cerradaRps: { at: "2026-09-15T11:42:00.000Z", por: "ivan", modo: "activo" as const, gemelaSinEscribir: "09" } },
  ],
};

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-reintentar-gemela-"));
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
  dataMod = await import("../data");
  process.env.FICHAJE_OLANET = "activo";
  estadoDb.getDb().exec("DELETE FROM of_overlay; DELETE FROM of_retenida; DELETE FROM olanet_pendiente; DELETE FROM fichaje_intervalo;");
  vi.spyOn(dataMod, "getTablero").mockResolvedValue({ operarios: [], pedidos: [PEDIDO] });
  // La OF ya está cerrada: la marca vive en of_overlay, no solo en el mock del
  // tablero (la ruta relee el overlay, como cerrar-of).
  estadoDb.guardarMutacion({
    operarioId: "ivan", motivo: "cerrar_en_rps",
    cambiosOF: [{
      ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null,
      cerradaRps: { at: "2026-09-15T11:42:00.000Z", por: "ivan", modo: "activo", gemelaSinEscribir: "09" },
    }],
  });
  buscarIdBoletin.mockResolvedValue("901");
  finalizarFase.mockResolvedValue({ ok: true, yaEstaba: false, idBoletin: "901" });
  ruta = await import("../../app/api/fases/cerrar-of/reintentar-gemela/route");
});
afterEach(() => vi.resetModules());

const post = (body: unknown) =>
  ruta.POST(new Request("http://x/api/fases/cerrar-of/reintentar-gemela", { method: "POST", body: JSON.stringify(body) }));

const marcaDe = () => estadoDb.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps;

test("solo el autor puede reintentar; otro técnico recibe 403", async () => {
  const res = await post({ ofId: "0232086:9", operarioId: "tamara" });
  expect(res.status).toBe(403);
  expect(finalizarFase).not.toHaveBeenCalled();
});

test("sin código de RPS es 400", async () => {
  const res = await post({ ofId: "0232086:9", operarioId: "sincodigo" });
  expect(res.status).toBe(400);
});

test("sin gemela pendiente, 409 y no se toca nada", async () => {
  estadoDb.guardarMutacion({
    operarioId: "ivan", motivo: "cerrar_en_rps",
    cambiosOF: [{
      ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null,
      cerradaRps: { at: "2026-09-15T11:42:00.000Z", por: "ivan", modo: "activo" },
    }],
  });
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect(finalizarFase).not.toHaveBeenCalled();
});

test("escribe SOLO la gemela y limpia la marca; el resto (quién y cuándo cerró) no cambia", async () => {
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(200);
  expect(finalizarFase).toHaveBeenCalledWith(expect.objectContaining({ idBoletin: "901", operarioRps: "195" }));
  expect(marcaDe()).toEqual({ at: "2026-09-15T11:42:00.000Z", por: "ivan", modo: "activo" });
});

test("respeta modoFichaje(): en sombra no escribe nada y la marca no se toca", async () => {
  delete process.env.FICHAJE_OLANET;
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect(finalizarFase).not.toHaveBeenCalled();
  expect(marcaDe()?.gemelaSinEscribir).toBe("09");
});

test("respeta modoFichaje(): en ensayo no escribe nada y la marca no se toca", async () => {
  process.env.FICHAJE_OLANET = "ensayo";
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect(finalizarFase).not.toHaveBeenCalled();
  expect(marcaDe()?.gemelaSinEscribir).toBe("09");
});

test("exige que no quede tiempo de la OF sin llegar a OLANET (pendiente)", async () => {
  const { encolarFichaje } = await import("../server/olanet-outbox");
  const { guardarFichaje } = await import("../server/fichaje-db");
  guardarFichaje("ivan", { intervalos: [{ inicio: "2026-09-15T10:00:00.000Z", fin: null, ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }] });
  encolarFichaje("ivan", [{ inicio: "2026-09-15T10:00:00.000Z", fin: null, ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }]);
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect(finalizarFase).not.toHaveBeenCalled();
  expect(marcaDe()?.gemelaSinEscribir).toBe("09");
});

test("relee el estado antes de escribir: si ya está terminada, no escribe y lo dice", async () => {
  const { estadoDeFase, maquinaDeFase } = await vi.importActual<typeof import("../server/olanet")>("../server/olanet");
  void estadoDeFase; void maquinaDeFase; // documentación: finalizarFase está mockeado entero aquí
  finalizarFase.mockResolvedValue({ ok: true, yaEstaba: true, idBoletin: "901" });
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  const d = await res.json();
  expect(res.status).toBe(200);
  expect(d.yaEstaba).toBe(true);
  expect(marcaDe()).toEqual({ at: "2026-09-15T11:42:00.000Z", por: "ivan", modo: "activo" });
});

test("RPS ya no tiene esa operación: se limpia la marca igual, sin escribir", async () => {
  buscarIdBoletin.mockResolvedValue(null);
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(200);
  expect(finalizarFase).not.toHaveBeenCalled();
  expect(marcaDe()).toEqual({ at: "2026-09-15T11:42:00.000Z", por: "ivan", modo: "activo" });
});

test("si OLANET rechaza la escritura, 409 y la marca se conserva", async () => {
  finalizarFase.mockResolvedValue({ ok: false, status: 409, error: "Esa fase no se puede finalizar desde aquí" });
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect(marcaDe()?.gemelaSinEscribir).toBe("09");
});

test("si OLANET no contesta, 503 y la marca se conserva", async () => {
  finalizarFase.mockRejectedValue(new Error("OLANET no contesta"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(503);
  expect(marcaDe()?.gemelaSinEscribir).toBe("09");
});
