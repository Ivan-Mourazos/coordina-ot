import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { AvisoLonaSinComprobar, AvisoStockPase, elegirCorreoStock } from "@/components/AvisoStockPase";
import { getDb } from "../server/estado-db";
import { guardarStockLona, leerStockLona, registrarAvisoLona } from "../server/stock-lona-db";
import { lanzarPlanteamiento } from "../server/mandar-planteamiento";
import { prepararCorreoStock } from "../server/correo-cola";
vi.mock("../server/correo-cola", () => ({ prepararCorreoStock: vi.fn(), modoCorreo: () => "off" }));
vi.mock("../server/impresion-cola", () => ({ modoImpresion: () => "off" }));
vi.hoisted(() => { process.env.COORDINA_DB_PATH = ":memory:"; });

const falta = { codigo: "LV1", descripcion: "", necesita: 2, disponible: 1, ofs: ["123", "124", "125"], entrega: 0 };
const aviso = { creadoAt: "2026-11-23T11:40:00Z", pasadoPor: "Iván" };
test.each([false, true])("la casilla refleja si ya se avisó (%s)", antes => {
  const s = { faltas: [{ ...falta, yaAvisado: aviso }, { ...falta, codigo: "LV2", yaAvisado: antes ? aviso : null }] };
  const html = renderToStaticMarkup(createElement(AvisoStockPase, { stock: s, marcado: elegirCorreoStock(s), onCambiar: vi.fn() }));
  expect(html.includes('checked=""')).toBe(!antes);
  expect(html.includes("Ya se avisó el 23/11 a las 12:40 (Iván)")).toBe(antes);
  expect(html).toContain("Mandar correo a Compras y Almacén");
  expect(html).toContain(">LV1</p>");
  expect(html).toContain(">LV2</p>");
  expect(html).toContain("OF 123, OF 124, OF 125");
});

test.each([
  [0, 42.3, true], [1, 42.305, true], [2, 42.306, false], [3, null, true],
])("la casilla compara los metros avisados y respeta los avisos antiguos (%i)", (caso, avisado, antes) => {
  const pedido = `AR.26.0507${caso}`;
  const actual = { ...falta, necesita: 42.3 };
  guardarStockLona({ pedido, entrega: null, cliente: "", ofs: actual.ofs, lonas: [], faltas: [actual],
    consultado: "2026-11-23T11:45:00Z", consultadoPor: null });
  if (avisado === null) {
    getDb().prepare(`INSERT INTO stock_lona_aviso (pedido_id, entrega, codigo, avisado_por, avisado_at)
      VALUES (?, 0, ?, ?, ?)`).run(pedido, actual.codigo, aviso.pasadoPor, aviso.creadoAt);
  } else {
    registrarAvisoLona(pedido, 0, { ...actual, necesita: avisado }, aviso.pasadoPor, aviso.creadoAt);
  }
  const stock = leerStockLona(pedido, actual.ofs)[0];
  const vista = { faltas: stock.faltas.map(f => ({ ...f, entrega: stock.entrega })) };
  const html = renderToStaticMarkup(createElement(AvisoStockPase, {
    stock: vista, marcado: elegirCorreoStock(vista), onCambiar: vi.fn(),
  }));
  expect(html.includes('checked=""')).toBe(!antes);
  expect(html.includes("Ya se avisó el 23/11 a las 12:40 (Iván)")).toBe(antes);
});

test("muestra las OF con lona sin comprobar solo si hay alguna", () => {
  const render = (ofs: string[]) => renderToStaticMarkup(createElement(AvisoLonaSinComprobar, { ofs }));
  expect(render(["0234012", "0234013"])).toContain("Sin comprobar el stock de lona: falta pasar el corte de la OF 0234012, 0234013.");
  expect(render([])).not.toContain("Sin comprobar");
});
test("necesita, disponible y lo reservado por cada pedido; las bobinas con su frase (Iván, 26/11/2026)", () => {
  const conCuenta = {
    faltas: [{
      codigo: "PLAST880NEGRP204", descripcion: "PVC 900 NEGRO 9005 · 300 AN",
      stock: 1257.8, reservado: 860, reservadoPropio: 40, disponible: 397.8, necesita: 410.2,
      reservas: [{ pedido: "AR.26.05330", ml: 800 }, { pedido: "AR.26.05401", ml: 60 }],
      ofs: ["0234125"], entrega: 0, yaAvisado: null,
    }],
  };
  const html = renderToStaticMarkup(createElement(AvisoStockPase, { stock: conCuenta, marcado: true, onCambiar: vi.fn() }));
  for (const t of [">PVC 900 NEGRO 9005 · 300 AN</p>", "PLAST880NEGRP204 · OF 0234125", "Necesita", "410,2 m", "Stock disponible",
    "397,8 m", "Reservado · AR.26.05330", "800 m", "Reservado · AR.26.05401", "60 m", "Ya reservado para este pedido", "#c20e4d"])
    expect(html).toContain(t);
  expect(html).not.toContain("Stock en almacén");

  const bobinas = { faltas: [{ ...conCuenta.faltas[0], disponible: 500, bobinaMayor: 300, reservas: [], reservadoPropio: 0 }] };
  const htmlBobinas = renderToStaticMarkup(createElement(AvisoStockPase, { stock: bobinas, marcado: true, onCambiar: vi.fn() }));
  expect(htmlBobinas).toContain("Hay stock, pero ninguna bobina llega a 410,2 m: la mayor tiene 300 m.");
  expect(htmlBobinas).not.toContain("para este pedido");
});
test("solo la elección explícita prepara el aviso, y un fallo no interrumpe el pase", () => {
  lanzarPlanteamiento("P", "ivan", undefined, { correoStock: false }, ["123"]);
  expect(prepararCorreoStock).not.toHaveBeenCalled();
  vi.mocked(prepararCorreoStock).mockImplementationOnce(() => { throw Error("SQLite"); });
  lanzarPlanteamiento("P", "ivan", undefined, { correoStock: true, reenviarStock: true }, ["123"]);
  expect(prepararCorreoStock).toHaveBeenCalledWith("P", "ivan", ["123"], true);
});
