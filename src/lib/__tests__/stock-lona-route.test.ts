import { test, expect, vi } from "vitest";
import { POST } from "@/app/api/integracion/stock-lona/route";
vi.hoisted(() => { process.env.COORDINA_DB_PATH = ":memory:"; });
const post = (clave: string, body: unknown) => POST(new Request("http://localhost/api/integracion/stock-lona", {
  method: "POST", headers: { "x-clave-integracion": clave }, body: JSON.stringify(body),
}));
test("exige la clave configurada y valida antes de guardar", async () => {
  vi.stubEnv("INTEGRACION_CLAVE", "");
  expect((await post("", {})).status).toBe(503);
  vi.stubEnv("INTEGRACION_CLAVE", "test");
  expect((await post("otra", {})).status).toBe(401);
  expect((await post("test", {})).status).toBe(400);
  const base = { pedido: "AR.26.05016", cliente: "", ofs: [], lonas: [], faltas: [],
    consultado: "2026-11-23T11:40:00Z", consultadoPor: null };
  expect((await post("test", base)).status).toBe(400);
  const r = await post("test", { ...base, entrega: null });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true });
});
