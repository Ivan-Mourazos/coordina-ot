import { expect, test, vi } from "vitest";
import { asuntoCorreoStock, cuerpoCorreoStock, cuerpoCorreoStockHtml } from "../correo-stock";
import { guardarStockLona, leerStockLona } from "../server/stock-lona-db";
import { getDb } from "../server/estado-db";
import { correosParaEnviar, destinatariosStock, prepararCorreoStock } from "../server/correo-cola";

vi.hoisted(() => { process.env.COORDINA_DB_PATH = ":memory:"; });
const s = { pedido: "AR.26.05016", entrega: 1, cliente: "Bar", ofs: ["123", "124"], lonas: [], consultadoPor: "Iván",
  faltas: [{ codigo: "LV1", descripcion: "Lona <gris>", necesita: 42.3, disponible: 18.75, ofs: ["123", "124"] }],
  consultado: "2026-11-23T11:40:00Z" };
const ahora = new Date("2026-11-23T11:42:00Z");
const correosDe = (pedido: string) => correosParaEnviar(ahora).filter(c => c.pedidoId === pedido);

test("asunto y versiones del correo según la maqueta", () => {
  expect(asuntoCorreoStock(s.pedido, "")).toBe("Falta material AR.26.05016");
  expect(asuntoCorreoStock(s.pedido, "Bar")).toBe("Falta material AR.26.05016 · Bar");
  for (const cuerpo of [cuerpoCorreoStock(s, "Iván"), cuerpoCorreoStockHtml(s, "Iván")])
    for (const t of ["LV1", "OF 123, 124", "42,30 m", "18,75 m", "23/11/2026 12:40", "Iván"]) expect(cuerpo).toContain(t);
  const html = cuerpoCorreoStockHtml(s, "Iván");
  expect(html).toContain("FALTA MATERIAL");
  expect(html).toContain("Lona &lt;gris&gt;");
});

test("solo encola faltas y congela los destinatarios del modo elegido", () => {
  vi.stubEnv("CORREO_PLANTEAMIENTO", "activo");
  guardarStockLona({ ...s, faltas: [] });
  expect(prepararCorreoStock(s.pedido, "tamara", s.ofs).encolado).toBe(false);
  guardarStockLona({ ...s, consultado: "2026-11-23T11:41:00Z" });
  vi.stubEnv("CORREO_PLANTEAMIENTO", "off");
  expect(prepararCorreoStock(s.pedido, "tamara", s.ofs).encolado).toBe(false);
  expect(correosDe(s.pedido)).toEqual([]);
  expect(leerStockLona(s.pedido, s.ofs)[0].faltas[0].yaAvisado).toBeNull();
  expect(destinatariosStock("off")).toEqual([]);
  expect(destinatariosStock("activo")).toEqual(["compras@toldosgomez.com", "almacen@toldosgomez.com"]);
  vi.stubEnv("CORREO_PLANTEAMIENTO", "ensayo");
  vi.stubEnv("CORREO_ENSAYO_PARA", "prueba@example.test");
  prepararCorreoStock(s.pedido, "tamara", s.ofs, false, ahora);
  vi.stubEnv("CORREO_PLANTEAMIENTO", "activo");
  vi.stubEnv("CORREO_STOCK_PARA", "compras@example.test");
  vi.stubEnv("CORREO_PARA", "COMPRAS@example.test,ot@example.test");
  prepararCorreoStock(s.pedido, "tamara", s.ofs, true, ahora);
  expect(correosDe(s.pedido)).toMatchObject([
    { para: ["prueba@example.test"], cc: [], ficheros: [] },
    { para: ["compras@example.test"], cc: ["ot@example.test", "tamara@toldosgomez.com"], ficheros: [] },
  ]);
  expect(leerStockLona(s.pedido, s.ofs)[0].faltas[0].yaAvisado).toEqual({ pasadoPor: "tamara", creadoAt: ahora.toISOString() });
});

test("envía una vez por lona y entrega, filtra por OF y permite el reenvío manual", () => {
  vi.stubEnv("CORREO_PLANTEAMIENTO", "ensayo");
  const pedido = "AR.26.05017";
  const otraLona = { ...s.faltas[0], codigo: "LV2", ofs: ["124"] };
  guardarStockLona({ ...s, pedido, faltas: [...s.faltas, otraLona] });
  guardarStockLona({ ...s, pedido, entrega: 2, ofs: ["125", "126"],
    faltas: [{ ...s.faltas[0], ofs: ["125", "126"] }] });

  expect(prepararCorreoStock(pedido, "ivan", ["123"], false, ahora).encolado).toBe(true);
  expect(correosDe(pedido)[0].cuerpo).toContain("OF 123\n");
  expect(correosDe(pedido)[0].cuerpo).not.toContain("LV2");
  expect(leerStockLona(pedido, ["124", "125"])).toMatchObject([
    { entrega: 2, faltas: [{ codigo: "LV1", yaAvisado: null }] },
    { entrega: 1, faltas: [{ codigo: "LV1", yaAvisado: { pasadoPor: "ivan" } }, { codigo: "LV2", yaAvisado: null }] },
  ]);

  const ofs = ["123", "124", "125", "126"];
  expect(prepararCorreoStock(pedido, "tamara", ofs, false, ahora).encolado).toBe(true);
  const nuevos = correosDe(pedido).slice(1).map(c => c.cuerpo);
  expect(nuevos).toHaveLength(2);
  expect(nuevos[0]).toContain("OF 125, 126\n");
  expect(nuevos[1]).toContain("LV2");
  expect(nuevos[1]).not.toContain("LV1");
  expect(prepararCorreoStock(pedido, "tamara", ofs, false, ahora).encolado).toBe(false);
  expect(prepararCorreoStock(pedido, "tamara", ["124"], true, ahora).encolado).toBe(true);
  expect(correosDe(pedido).slice(3).map(c => c.cuerpo)).toEqual([
    expect.stringContaining("LV1"), expect.stringContaining("LV2"),
  ]);
});

test("si falla el registro del aviso tampoco se queda el correo en cola", () => {
  vi.stubEnv("CORREO_PLANTEAMIENTO", "ensayo");
  const pedido = "AR.26.05018";
  guardarStockLona({ ...s, pedido, faltas: [{ ...s.faltas[0], codigo: "ERROR" }] });
  getDb().exec(`CREATE TEMP TRIGGER fallar_aviso BEFORE INSERT ON stock_lona_aviso
    WHEN NEW.codigo = 'ERROR' BEGIN SELECT RAISE(ABORT, 'fallo al registrar'); END`);
  expect(() => prepararCorreoStock(pedido, "ivan", s.ofs, false, ahora)).toThrow("fallo al registrar");
  expect(correosDe(pedido)).toEqual([]);
  expect(leerStockLona(pedido, s.ofs)[0].faltas[0].yaAvisado).toBeNull();
});
