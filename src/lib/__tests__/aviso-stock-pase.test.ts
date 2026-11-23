import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { AvisoStockPase, elegirCorreoStock } from "@/components/AvisoStockPase";
import { lanzarPlanteamiento } from "../server/mandar-planteamiento";
import { prepararCorreoStock } from "../server/correo-cola";
vi.mock("../server/correo-cola", () => ({ prepararCorreoStock: vi.fn(), modoCorreo: () => "off" }));
vi.mock("../server/impresion-cola", () => ({ modoImpresion: () => "off" }));

const falta = { codigo: "LV1", descripcion: "", necesita: 2, disponible: 1, ofs: ["123"], entrega: 0 };
const aviso = { creadoAt: "2026-11-23T11:40:00Z", pasadoPor: "Iván" };
test.each([false, true])("la casilla refleja si ya se avisó (%s)", antes => {
  const s = { faltas: [{ ...falta, yaAvisado: aviso }, { ...falta, codigo: "LV2", yaAvisado: antes ? aviso : null }] };
  const html = renderToStaticMarkup(createElement(AvisoStockPase, { stock: s, marcado: elegirCorreoStock(s), onCambiar: vi.fn() }));
  expect(html.includes('checked=""')).toBe(!antes);
  expect(html.includes("Ya se avisó el 23/11 a las 12:40 (Iván)")).toBe(antes);
  expect(html).toContain("Mandar correo a Compras y Almacén");
});
test("solo la elección explícita prepara el aviso, y un fallo no interrumpe el pase", () => {
  lanzarPlanteamiento("P", "ivan", undefined, { correoStock: false }, ["123"]);
  expect(prepararCorreoStock).not.toHaveBeenCalled();
  vi.mocked(prepararCorreoStock).mockImplementationOnce(() => { throw Error("SQLite"); });
  lanzarPlanteamiento("P", "ivan", undefined, { correoStock: true, reenviarStock: true }, ["123"]);
  expect(prepararCorreoStock).toHaveBeenCalledWith("P", "ivan", ["123"], true);
});
