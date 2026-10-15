import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Ni el disco compartido ni la impresora se tocan: los dos módulos se simulan.
const { planteamientosMock, modoMock, prepararMock } = vi.hoisted(() => ({
  planteamientosMock: vi.fn(),
  modoMock: vi.fn(() => "activo"),
  prepararMock: vi.fn(async () => ({ encolados: 1, manuales: [] as string[], aviso: null as string | null })),
}));
vi.mock("../server/planteamiento-pdf", () => ({ planteamientosDe: planteamientosMock }));
vi.mock("../server/impresion-cola", () => ({
  modoImpresion: modoMock,
  prepararImpresion: prepararMock,
  leerImpresionesDe: () => [],
}));
// Y el correo: nada habla con Microsoft.
const { modoCorreoMock, reenviarMock } = vi.hoisted(() => ({
  modoCorreoMock: vi.fn(() => "activo"),
  reenviarMock: vi.fn(async () => true),
}));
vi.mock("../server/correo-cola", async (importOriginal) => ({
  ...await importOriginal<typeof import("../server/correo-cola")>(),
  modoCorreo: modoCorreoMock,
  leerCorreosDe: () => [{ id: 1, estado: "enviado" }],
  reenviarUltimo: reenviarMock,
}));

vi.mock("../data", () => ({
  getTablero: vi.fn(async () => ({ pedidos: [{ codigo: "AR.26.05016", ofs: [
    { autorId: "tamara", estado: "aprobada" }, { autorId: "angel", estado: "aprobada" },
    { autorId: "tamara", estado: "aprobada" }, { autorId: "jaime", estado: "anulada" },
    { autorId: "alberto", estado: "aprobada", ajenaOT: true }, { autorId: "sin-correo", estado: "aprobada" },
  ] }] })),
}));

let dir: string;
let ruta: typeof import("../../app/api/planteamiento/route");
let fichero: typeof import("../../app/api/planteamiento/fichero/route");
let reimprimir: typeof import("../../app/api/planteamiento/reimprimir/route");
let reenviar: typeof import("../../app/api/planteamiento/reenviar/route");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-planteamiento-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.DATASOURCE = "mock";
  ruta = await import("../../app/api/planteamiento/route");
  fichero = await import("../../app/api/planteamiento/fichero/route");
  reimprimir = await import("../../app/api/planteamiento/reimprimir/route");
  reenviar = await import("../../app/api/planteamiento/reenviar/route");
});
afterAll(() => {
  delete process.env.DATASOURCE;
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows/WAL: best effort */ }
});
beforeEach(() => {
  vi.clearAllMocks();
  modoMock.mockReturnValue("activo");
  modoCorreoMock.mockReturnValue("activo");
  reenviarMock.mockResolvedValue(true);
  planteamientosMock.mockResolvedValue({
    ficheros: [{ nombre: "AR2605016-10.pdf", ruta: "Z:/no/existe/AR2605016-10.pdf", origen: "cad", paginas: 1, todoA4: true }],
    aviso: null,
  });
});

test("GET devuelve modo, ficheros e impresiones", async () => {
  const r = await ruta.GET(new Request("http://x/api/planteamiento?pedido=AR.26.05016"));
  expect(r.status).toBe(200);
  const j = await r.json();
  expect(j).toMatchObject({ modo: "activo", ficheros: [{ nombre: "AR2605016-10.pdf", paginas: 1, todoA4: true }], impresiones: [] });
  // La ruta del disco no sale del servidor.
  expect(j.ficheros[0].ruta).toBeUndefined();
});

test("GET con un código que no es de pedido: 400", async () => {
  expect((await ruta.GET(new Request("http://x/api/planteamiento?pedido=../etc"))).status).toBe(400);
});

test("fichero: solo sirve un nombre que esté en la lista del pedido", async () => {
  expect((await fichero.GET(new Request("http://x/api/planteamiento/fichero?pedido=AR.26.05016&nombre=..%2F..%2Fsecreto.pdf"))).status).toBe(404);
});

test("reimprimir en off: 409", async () => {
  modoMock.mockReturnValueOnce("off");
  const r = await reimprimir.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ pedido: "AR.26.05016", operarioId: "ivan" }) }));
  expect(r.status).toBe(409);
  expect(prepararMock).not.toHaveBeenCalled();
});

test("reimprimir encola y devuelve el resultado", async () => {
  const r = await reimprimir.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ pedido: "AR.26.05016", operarioId: "ivan" }) }));
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ encolados: 1, manuales: [], aviso: null });
  expect(prepararMock).toHaveBeenCalledWith("AR.26.05016", "ivan");
});

const post = (b: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(b) });

test("GET también cuenta el correo", async () => {
  // Con la caducidad lejos, sin aviso; sin fijarla, este test fallaría solo
  // al acercarse la fecha de verdad.
  process.env.GRAPH_SECRETO_CADUCA = "2099-01-01";
  try {
    const r = await ruta.GET(new Request("http://x/api/planteamiento?pedido=AR.26.05016"));
    expect((await r.json()).correo).toEqual({ modo: "activo", cc: ["tamara@toldosgomez.com", "angel@toldosgomez.com"], envios: [{ id: 1, estado: "enviado" }], caducaSecreto: null });
  } finally {
    delete process.env.GRAPH_SECRETO_CADUCA;
  }
});

test("reenviar: encola y responde ok", async () => {
  const r = await reenviar.POST(post({ pedido: "AR.26.05016", operarioId: "ivan" }));
  expect(r.status).toBe(200);
  expect(reenviarMock).toHaveBeenCalledWith("AR.26.05016", "ivan");
});

test("GET en ensayo no anuncia copias ni consulta los autores en RPS", async () => {
  const { getTablero } = await import("../data");
  modoCorreoMock.mockReturnValue("ensayo");
  const r = await ruta.GET(new Request("http://x/api/planteamiento?pedido=AR.26.05016"));
  expect((await r.json()).correo).toMatchObject({ modo: "ensayo", cc: [] });
  expect(getTablero).not.toHaveBeenCalled();
});

test("GET conserva el historial del correo aunque falle consultar los autores", async () => {
  const { getTablero } = await import("../data");
  vi.mocked(getTablero).mockRejectedValueOnce(new Error("RPS no responde"));
  const r = await ruta.GET(new Request("http://x/api/planteamiento?pedido=AR.26.05016"));
  expect((await r.json()).correo).toMatchObject({ cc: [], envios: [{ id: 1, estado: "enviado" }] });
});

test("reenviar sin correo previo: 404; en off: 409; pedido raro: 400", async () => {
  reenviarMock.mockResolvedValueOnce(false);
  expect((await reenviar.POST(post({ pedido: "AR.26.05016", operarioId: "ivan" }))).status).toBe(404);
  modoCorreoMock.mockReturnValueOnce("off");
  expect((await reenviar.POST(post({ pedido: "AR.26.05016", operarioId: "ivan" }))).status).toBe(409);
  expect((await reenviar.POST(post({ pedido: "../x", operarioId: "ivan" }))).status).toBe(400);
});
