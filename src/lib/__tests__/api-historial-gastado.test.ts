import { afterEach, beforeEach, expect, test, vi } from "vitest";

const leerMaterialGastadoPedido = vi.fn();
vi.mock("@/lib/server/historial-db", () => ({
  leerMaterialGastadoPedido: (p: string) => leerMaterialGastadoPedido(p),
}));
// Login apagado por defecto en los tests: soloConSesion deja pasar a todos.
vi.mock("@/lib/server/sesion", () => ({ soloConSesion: () => null }));

let ruta: typeof import("../../app/api/historial/[pedido]/gastado/route");

beforeEach(async () => {
  vi.clearAllMocks();
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
