import { expect, test } from "vitest";
import * as pagina from "../../app/api/historial/route";
import * as detalle from "../../app/api/historial/[pedido]/route";

test("GET página devuelve { pedidos, hasMore }", async () => {
  const res = await pagina.GET(new Request("http://x/api/historial?page=0"));
  expect(res.status).toBe(200);
  const data = (await res.json()) as { pedidos: unknown[]; hasMore: boolean };
  expect(Array.isArray(data.pedidos)).toBe(true);
  expect(typeof data.hasMore).toBe("boolean");
});

test("GET página con page inválida cae a 0 (no rompe)", async () => {
  const res = await pagina.GET(new Request("http://x/api/historial?page=abc"));
  expect(res.status).toBe(200);
});

test("GET detalle con código válido responde 200 y el detalle del pedido", async () => {
  const res = await detalle.GET(new Request("http://x/api/historial/AR.26.03453"), {
    params: Promise.resolve({ pedido: "AR.26.03453" }),
  });
  expect(res.status).toBe(200);
  const data = (await res.json()) as { codigo: string; ofs: unknown[]; scanUrl: string };
  expect(data.codigo).toBe("AR.26.03453");
  expect(Array.isArray(data.ofs)).toBe(true);
  expect(data.scanUrl).toBe("/api/pedidos/AR.26.03453.pdf");
});

test("GET detalle con código inválido responde 400", async () => {
  const res = await detalle.GET(new Request("http://x/api/historial/xxx"), {
    params: Promise.resolve({ pedido: "xxx" }),
  });
  expect(res.status).toBe(400);
});
