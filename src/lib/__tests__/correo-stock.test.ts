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
    for (const t of ["LV1", "OF 123, OF 124", "42,30 m", "18,75 m", "23/11/2026 12:40", "Iván"]) expect(cuerpo).toContain(t);
  const html = cuerpoCorreoStockHtml(s, "Iván");
  expect(html).toContain("FALTA MATERIAL");
  expect(html).toContain("Lona &lt;gris&gt;");
});

test("con la cuenta, texto plano y HTML muestran stock, reservas, disponible, falta y propio", () => {
  const conCuenta = {
    ...s,
    faltas: [{
      codigo: "PLAST880NEGRP204", descripcion: "PVC negro 204",
      stock: 1257.8, reservado: 860, reservadoPropio: 40, disponible: 397.8, necesita: 410.2,
      ofs: ["0234125"],
    }],
  };
  const texto = cuerpoCorreoStock(conCuenta, "Iván");
  expect(texto).toBe([
    "Falta material AR.26.05016 · Bar",
    "",
    "OF 0234125",
    "No llega el stock de PLAST880NEGRP204 PVC negro 204",
    "Stock en almacén: 1.257,8 m",
    "− Reservado (otros pedidos): 860 m",
    "= Disponible: 397,8 m",
    "Necesita este pedido: 410,2 m",
    "Faltan: 12,4 m",
    "Reservado para este pedido: 40 m (no se resta)",
    "",
    "Stock consultado 23/11/2026 12:40",
    "Por Iván",
  ].join("\n"));

  const html = cuerpoCorreoStockHtml(conCuenta, "Iván");
  for (const trozo of [
    "Stock en almacén", "1.257,8 m",
    "− Reservado (otros pedidos)", "860 m",
    "= Disponible", "397,8 m",
    "Necesita este pedido", "410,2 m",
    "Faltan", "12,4 m", "#c20e4d",
    "Reservado para este pedido: 40 m (no se resta)",
  ]) expect(html).toContain(trozo);
  expect(html).toMatch(/color:#c20e4d[^>]*>Faltan<\/td>/);

  const sinPropio = { ...conCuenta, faltas: [{ ...conCuenta.faltas[0], reservadoPropio: 0 }] };
  expect(cuerpoCorreoStock(sinPropio, "Iván")).not.toContain("Reservado para este pedido");
  expect(cuerpoCorreoStockHtml(sinPropio, "Iván")).not.toContain("Reservado para este pedido");
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
  expect(correosDe(pedido)[0].cuerpo).toContain("OF 123, OF 124\n");
  expect(correosDe(pedido)[0].cuerpo).not.toContain("LV2");
  expect(leerStockLona(pedido, ["124", "125"])).toMatchObject([
    { entrega: 2, faltas: [{ codigo: "LV1", yaAvisado: null }] },
    { entrega: 1, faltas: [{ codigo: "LV1", yaAvisado: { pasadoPor: "ivan" } }, { codigo: "LV2", yaAvisado: null }] },
  ]);

  const ofs = ["123", "124", "125", "126"];
  expect(prepararCorreoStock(pedido, "tamara", ofs, false, ahora).encolado).toBe(true);
  const nuevos = correosDe(pedido).slice(1).map(c => c.cuerpo);
  expect(nuevos).toHaveLength(2);
  expect(nuevos[0]).toContain("OF 125, OF 126\n");
  expect(nuevos[1]).toContain("LV2");
  expect(nuevos[1]).not.toContain("LV1");
  expect(prepararCorreoStock(pedido, "tamara", ofs, false, ahora).encolado).toBe(false);
  expect(prepararCorreoStock(pedido, "tamara", ["124"], true, ahora).encolado).toBe(true);
  expect(correosDe(pedido).slice(3).map(c => c.cuerpo)).toEqual([
    expect.stringContaining("LV1"), expect.stringContaining("LV2"),
  ]);
});

test.each([1, 3])("al pasar %i OF, encola un correo con las tres OF y los metros del corte", cantidad => {
  vi.stubEnv("CORREO_PLANTEAMIENTO", "ensayo");
  const pedido = `AR.26.0502${cantidad}`;
  const ofs = ["123", "124", "125"];
  guardarStockLona({ ...s, pedido, ofs, faltas: [{ ...s.faltas[0], ofs }] });

  expect(prepararCorreoStock(pedido, "ivan", ofs.slice(0, cantidad), false, ahora).encolado).toBe(true);
  const correos = correosDe(pedido);
  expect(correos).toHaveLength(1);
  expect(correos[0].cuerpo).toContain("OF 123, OF 124, OF 125\nNo llega el stock de LV1");
  expect(correos[0].cuerpo).toContain("Necesita: 42,30 m · Stock disponible: 18,75 m");
  expect(correos[0].html).toMatch(/OF 123, OF 124, OF 125<\/div>\s*<table[^>]+border-radius:12px[\s\S]*?No llega el stock de/);
  expect(correos[0].html).toContain("42,30 m");
  expect(correos[0].html).toContain("18,75 m");
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
