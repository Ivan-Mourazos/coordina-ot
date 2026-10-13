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

let dir: string;
let ruta: typeof import("../../app/api/planteamiento/route");
let fichero: typeof import("../../app/api/planteamiento/fichero/route");
let reimprimir: typeof import("../../app/api/planteamiento/reimprimir/route");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-planteamiento-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.DATASOURCE = "mock";
  ruta = await import("../../app/api/planteamiento/route");
  fichero = await import("../../app/api/planteamiento/fichero/route");
  reimprimir = await import("../../app/api/planteamiento/reimprimir/route");
});
afterAll(() => {
  delete process.env.DATASOURCE;
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows/WAL: best effort */ }
});
beforeEach(() => {
  vi.clearAllMocks();
  modoMock.mockReturnValue("activo");
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
