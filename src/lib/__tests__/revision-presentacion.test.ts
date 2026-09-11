import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { RevisionView } from "../../components/RevisionView";
import { OPERARIOS, PEDIDOS } from "../mock";
import type { EstadoOF } from "../types";

function presentar(estados: EstadoOF[]) {
  const pedido = {
    ...PEDIDOS[0],
    ofs: estados.map((estado, i) => ({
      ...PEDIDOS[0].ofs[0], id: `of-${i}`, codigo: `OF-${i}`, estado,
      ajenaOT: false, detenida: false, autorId: "autor", revisorId: "revisor",
    })),
  };
  return renderToStaticMarkup(createElement(RevisionView, {
    pedidos: [pedido], operarios: OPERARIOS, miId: "revisor",
    onOpen() {}, onCambiarRevisor() {}, onAccion() {},
  }));
}

test("aprobar una OF no anuncia el pedido listo si queda otra devuelta", () => {
  const html = presentar(["aprobada", "devuelta"]);
  expect(html).toContain("1 de 2 OF aprobadas");
  expect(html).toContain("queda trabajo pendiente");
  expect(html).not.toContain("Pedido listo para pasar a Producción");
});

test("el pedido solo se anuncia listo cuando todas sus OF están aprobadas", () => {
  expect(presentar(["aprobada", "aprobada"])).toContain("Pedido listo para pasar a Producción");
  expect(presentar(["aprobada", "por_revisar"])).not.toContain("Pedido listo para pasar a Producción");
});
