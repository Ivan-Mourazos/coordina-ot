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
  expect(html).toContain("LV1 · OF 123, OF 124, OF 125 · necesita");
  expect(html).toContain("LV2 · OF 123, OF 124, OF 125 · necesita");
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
test("con la cuenta muestra stock menos reservados, disponible, necesita, faltan y reservado propio", () => {
  const conCuenta = {
    faltas: [{
      codigo: "PLAST880NEGRP204", descripcion: "PVC negro 204",
      stock: 1257.8, reservado: 860, reservadoPropio: 40, disponible: 397.8, necesita: 410.2,
      ofs: ["0234125"], entrega: 0, yaAvisado: null,
    }],
  };
  const html = renderToStaticMarkup(createElement(AvisoStockPase, { stock: conCuenta, marcado: true, onCambiar: vi.fn() }));
  expect(html).toContain("PLAST880NEGRP204 · OF 0234125 · stock 1.257,8 m − 860 m reservados = 397,8 m disponible · necesita 410,2 m");
  expect(html).toContain("faltan 12,4 m");
  expect(html).toContain("#c20e4d");
  expect(html).toContain("Reservado para este pedido: 40 m (no se resta)");

  const sinPropio = { faltas: [{ ...conCuenta.faltas[0], reservadoPropio: 0 }] };
  const htmlSinPropio = renderToStaticMarkup(createElement(AvisoStockPase, { stock: sinPropio, marcado: true, onCambiar: vi.fn() }));
  expect(htmlSinPropio).not.toContain("Reservado para este pedido");
});
test("solo la elección explícita prepara el aviso, y un fallo no interrumpe el pase", () => {
  lanzarPlanteamiento("P", "ivan", undefined, { correoStock: false }, ["123"]);
  expect(prepararCorreoStock).not.toHaveBeenCalled();
  vi.mocked(prepararCorreoStock).mockImplementationOnce(() => { throw Error("SQLite"); });
  lanzarPlanteamiento("P", "ivan", undefined, { correoStock: true, reenviarStock: true }, ["123"]);
  expect(prepararCorreoStock).toHaveBeenCalledWith("P", "ivan", ["123"], true);
});
