import { expect, test, vi } from "vitest";
import { asuntoCorreoStock, cuerpoCorreoStock, cuerpoCorreoStockHtml } from "../correo-stock";
import { guardarStockLona } from "../server/stock-lona-db";
import { correosParaEnviar, destinatariosStock, prepararCorreoStock, ultimoCorreoStock } from "../server/correo-cola";

vi.hoisted(() => { process.env.COORDINA_DB_PATH = ":memory:"; });
const s = { pedido: "AR.26.05016", cliente: "Bar", ofs: [], lonas: [], consultadoPor: "Iván",
  faltas: [{ codigo: "LV1", descripcion: "Lona <gris>", necesita: 42.3, disponible: 18.75 }],
  consultado: "2026-11-23T11:40:00Z", recibidoAt: "2026-11-23T11:42:00Z" };

test("asunto y versiones del correo según la maqueta", () => {
  expect(asuntoCorreoStock(s.pedido, "")).toBe("Falta material AR.26.05016");
  expect(asuntoCorreoStock(s.pedido, "Bar")).toBe("Falta material AR.26.05016 · Bar");
  for (const cuerpo of [cuerpoCorreoStock(s, "Iván"), cuerpoCorreoStockHtml(s, "Iván")])
    for (const t of ["LV1", "42,30 m", "18,75 m", "23/11/2026 12:40", "Iván"]) expect(cuerpo).toContain(t);
  const html = cuerpoCorreoStockHtml(s, "Iván");
  expect(html).toContain("FALTA MATERIAL");
  expect(html).toContain("Lona &lt;gris&gt;");
});

test("solo encola faltas y congela los destinatarios del modo elegido", () => {
  vi.stubEnv("CORREO_PLANTEAMIENTO", "activo");
  guardarStockLona({ ...s, faltas: [] });
  expect(prepararCorreoStock(s.pedido, "tamara").encolado).toBe(false);
  guardarStockLona(s);
  vi.stubEnv("CORREO_PLANTEAMIENTO", "off");
  expect(prepararCorreoStock(s.pedido, "tamara").encolado).toBe(false);
  expect(destinatariosStock("off")).toEqual([]);
  expect(destinatariosStock("activo")).toEqual(["compras@toldosgomez.com", "almacen@toldosgomez.com"]);
  const ahora = new Date(s.recibidoAt);
  vi.stubEnv("CORREO_PLANTEAMIENTO", "ensayo");
  vi.stubEnv("CORREO_ENSAYO_PARA", "prueba@example.test");
  prepararCorreoStock(s.pedido, "tamara", ahora);
  vi.stubEnv("CORREO_PLANTEAMIENTO", "activo");
  vi.stubEnv("CORREO_STOCK_PARA", "compras@example.test");
  vi.stubEnv("CORREO_PARA", "COMPRAS@example.test,ot@example.test");
  prepararCorreoStock(s.pedido, "tamara", ahora);
  expect(correosParaEnviar(ahora)).toMatchObject([
    { para: ["prueba@example.test"], cc: [], ficheros: [] },
    { para: ["compras@example.test"], cc: ["ot@example.test", "tamara@toldosgomez.com"], ficheros: [] },
  ]);
  expect(ultimoCorreoStock(s.pedido)).toMatchObject({ pasadoPor: "tamara" });
});
