import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const leerMaterialGastadoPedido = vi.fn();
vi.mock("@/lib/server/historial-db", () => ({
  leerMaterialGastadoPedido: (p: string) => leerMaterialGastadoPedido(p),
}));
// `soloConSesion` NO se simula: es la puerta de esta ruta, y con un mock que
// siempre deja pasar el test de "sin sesión" no podía fallar nunca. Se usa la
// de verdad y lo que se mueve es el interruptor del login, como en producción
// (COORDINA_LOGIN; ver server/sesion.ts). Apagado deja pasar a todos, que es
// como se despliega hoy y lo que asumen los tests de aquí abajo.
let dir: string;
let ruta: typeof import("../../app/api/historial/[pedido]/gastado/route");

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-gastado-ruta-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.COORDINA_SESION_SECRET = "secreto-de-pruebas";
});
afterAll(() => {
  delete process.env.COORDINA_LOGIN;
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows/WAL: best effort */ }
});

beforeEach(async () => {
  vi.clearAllMocks();
  delete process.env.COORDINA_LOGIN;
  ruta = await import("../../app/api/historial/[pedido]/gastado/route");
});
afterEach(() => vi.resetModules());

const get = (pedido: string) =>
  ruta.GET(new Request(`http://x/api/historial/${pedido}/gastado`), {
    params: Promise.resolve({ pedido }),
  });

test("código de pedido inválido es 400 y no consulta nada", async () => {
  const res = await get("'; DROP--");
  expect(res.status).toBe(400);
  expect(leerMaterialGastadoPedido).not.toHaveBeenCalled();
});

test("devuelve el mapa de la consulta", async () => {
  leerMaterialGastadoPedido.mockResolvedValue({ "0232070": [{ material: "TUBO", codigo: "T1", gastado: 2, ultimaSalida: "2026-09-10" }] });
  const res = await get("AR.26.04488");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ gastado: { "0232070": [{ material: "TUBO", codigo: "T1", gastado: 2, ultimaSalida: "2026-09-10" }] } });
});

test("RPS caído es 500, no un 200 con datos falsos", async () => {
  leerMaterialGastadoPedido.mockRejectedValue(new Error("timeout"));
  expect((await get("AR.26.04488")).status).toBe(500);
});

// ── La puerta: solo el equipo ───────────────────────────────────────────────
// Spec del 15/09/2026, sección 1: "Sin sesión, GET /api/historial/[pedido]/
// gastado contesta como el detalle (soloConSesion)". Lo que salió del almacén
// no es para toda la red.

test("con el login encendido y sin sesión no se enseña, y ni se consulta RPS", async () => {
  process.env.COORDINA_LOGIN = "activo";
  const res = await get("AR.26.04488");
  expect(res.status).toBe(401);
  expect(leerMaterialGastadoPedido).not.toHaveBeenCalled();
});

test("y una cookie falsificada tampoco entra", async () => {
  process.env.COORDINA_LOGIN = "activo";
  const res = await ruta.GET(
    new Request("http://x/api/historial/AR.26.04488/gastado", {
      headers: { cookie: "coordina_sesion=tamara.123.firmainventada" },
    }),
    { params: Promise.resolve({ pedido: "AR.26.04488" }) },
  );
  expect(res.status).toBe(401);
  expect(leerMaterialGastadoPedido).not.toHaveBeenCalled();
});

test("con el login apagado (como se despliega hoy) se lee igual que siempre", async () => {
  leerMaterialGastadoPedido.mockResolvedValue({});
  expect((await get("AR.26.04488")).status).toBe(200);
});
