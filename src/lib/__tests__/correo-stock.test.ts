import { expect, test, vi } from "vitest";
import { asuntoCorreoStock, cuerpoCorreoStock, cuerpoCorreoStockHtml } from "../correo-stock";
import { guardarStockLona, leerStockLona, validarStockLona } from "../server/stock-lona-db";
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
    for (const t of ["LV1", "OF 123, OF 124", "42,3 m", "18,75 m", "23/11/2026 12:40", "Iván"]) expect(cuerpo).toContain(t);
  const html = cuerpoCorreoStockHtml(s, "Iván");
  expect(html).toContain("FALTA MATERIAL");
  expect(html).toContain("Lona &lt;gris&gt;");
});

test("simplificado: necesita, disponible y lo reservado por cada pedido (Iván, 26/11/2026)", () => {
  const conCuenta = {
    ...s,
    faltas: [{
      codigo: "PLAST880NEGRP204", descripcion: "PVC 900 NEGRO 9005 · 300 AN",
      stock: 1257.8, reservado: 860, reservadoPropio: 40, disponible: 397.8, necesita: 410.2,
      reservas: [{ pedido: "AR.26.05330", ml: 800 }, { pedido: "AR.26.05401", ml: 60 }],
      ofs: ["0234125"],
    }],
  };
  expect(cuerpoCorreoStock(conCuenta, "Iván")).toBe([
    "Falta material AR.26.05016 · Bar",
    "",
    "OF 0234125",
    "PVC 900 NEGRO 9005 · 300 AN (PLAST880NEGRP204)",
    "Necesita: 410,2 m",
    "Stock disponible: 397,8 m",
    "Reservado para otros pedidos:",
    "  AR.26.05330: 800 m",
    "  AR.26.05401: 60 m",
    "Ya reservado para este pedido: 40 m",
    "",
    "Stock consultado 23/11/2026 12:40",
    "Por Iván",
  ].join("\n"));
  const html = cuerpoCorreoStockHtml(conCuenta, "Iván");
  for (const trozo of ["Necesita", "410,2 m", "Stock disponible", "397,8 m", "Reservado · AR.26.05330", "800 m",
    "Reservado · AR.26.05401", "60 m", "Ya reservado para este pedido", "40 m"]) expect(html).toContain(trozo);
  expect(html).not.toContain("Stock en almacén");

  const sinPropio = { ...conCuenta, faltas: [{ ...conCuenta.faltas[0], reservadoPropio: 0, reservas: [] }] };
  expect(cuerpoCorreoStock(sinPropio, "Iván")).not.toContain("para este pedido");
  expect(cuerpoCorreoStock(sinPropio, "Iván")).toContain("Reservado para otros pedidos: 860 m");
});

test("sumando llega pero ninguna bobina sola: lo dice así, con el dato nuevo y con el de antes", () => {
  const nueva = { ...s, faltas: [{ codigo: "MONZAAZ15P250", descripcion: "PVC 580 AZUL 5015 · 250 AN",
    necesita: 60, disponible: 245.7, bobinaMayor: 48.5, stock: 245.7, reservado: 0, reservadoPropio: 0, ofs: ["123"] }] };
  const antigua = { ...s, faltas: [{ codigo: "MONZAAZ15P250",
    descripcion: "PVC 580 AZUL 5015 · 250 AN — ninguna bobina sola llega (la mayor, 48,5 m; en total 245,7 m)",
    necesita: 60, disponible: 48.5, ofs: ["123"] }] };
  for (const datos of [nueva, antigua]) {
    const texto = cuerpoCorreoStock(datos, "Iván");
    expect(texto).toContain("PVC 580 AZUL 5015 · 250 AN (MONZAAZ15P250)\nNecesita: 60 m\nStock disponible: 245,7 m\n"
      + "Hay stock, pero ninguna bobina llega a 60 m: la mayor tiene 48,5 m.");
    expect(cuerpoCorreoStockHtml(datos, "Iván")).toContain("Hay stock, pero ninguna bobina llega a 60 m: la mayor tiene 48,5 m.");
  }
});

test("Coordina acepta las reservas por pedido y la bobina mayor, y rechaza lo que no cuadra", () => {
  const base = { pedido: "AR.26.05016", entrega: 1, cliente: "Bar", ofs: ["123"], lonas: [], consultadoPor: null,
    consultado: "2026-11-23T11:40:00Z" };
  const falta = { codigo: "LV1", descripcion: "PVC", necesita: 60, disponible: 245.7, ofs: ["123"] };
  expect(validarStockLona({ ...base, faltas: [{ ...falta, bobinaMayor: 48.5, reservas: [{ pedido: "AR.26.05330", ml: 50 }] }] })?.faltas[0])
    .toMatchObject({ bobinaMayor: 48.5, reservas: [{ pedido: "AR.26.05330", ml: 50 }] });
  expect(validarStockLona({ ...base, faltas: [falta] })).toBeNull();
  expect(validarStockLona({ ...base, faltas: [{ ...falta, bobinaMayor: 60 }] })).toBeNull();
  expect(validarStockLona({ ...base, faltas: [{ ...falta, disponible: 10, reservas: [{ pedido: "", ml: 5 }] }] })).toBeNull();
  expect(validarStockLona({ ...base, faltas: [{ ...falta, disponible: 10, otra: 1 }] })).toBeNull();
  expect(validarStockLona({ ...base, faltas: [{ ...falta, disponible: 10, stock: 10 }] })).toBeNull();
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
  expect(correos[0].cuerpo).toContain("OF 123, OF 124, OF 125\nLona <gris> (LV1)");
  expect(correos[0].cuerpo).toContain("Necesita: 42,3 m\nStock disponible: 18,75 m");
  expect(correos[0].html).toMatch(/OF 123, OF 124, OF 125<\/div>\s*<table[^>]+border-radius:12px[\s\S]*?Lona &lt;gris&gt;/);
  expect(correos[0].html).toContain("42,3 m");
  expect(correos[0].html).toContain("18,75 m");
});

test("la misma lona en dos planos conserva ambos avisos y solo repite el que cambia de metros", () => {
  vi.stubEnv("CORREO_PLANTEAMIENTO", "ensayo");
  const pedido = "AR.26.05019";
  const f = s.faltas[0];
  guardarStockLona({ ...s, pedido, ofs: ["123"], faltas: [{ ...f, ofs: ["123"] }] });
  const segundo = { ...s, pedido, origen: "plano-manual" as const, ofs: ["124"],
    faltas: [{ ...f, necesita: 60, ofs: ["124"] }], consultado: "2026-11-23T11:45:00Z" };
  guardarStockLona(segundo);
  const ambas = ["123", "124"];
  expect(prepararCorreoStock(pedido, "ivan", ambas, false, ahora).encolado).toBe(true);
  expect(correosDe(pedido)).toHaveLength(2);
  expect(prepararCorreoStock(pedido, "ivan", ambas, false, ahora).encolado).toBe(false);
  guardarStockLona({ ...segundo, faltas: [{ ...segundo.faltas[0], necesita: 65 }], consultado: "2026-11-23T11:50:00Z" });
  expect(prepararCorreoStock(pedido, "ivan", ambas, false, ahora).encolado).toBe(true);
  const correos = correosDe(pedido);
  expect(correos).toHaveLength(3);
  expect(correos[2].cuerpo).toContain("Necesita: 65 m");
  expect(prepararCorreoStock(pedido, "ivan", ambas, false, ahora).encolado).toBe(false);
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
