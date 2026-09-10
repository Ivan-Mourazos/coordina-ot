import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Drawer } from "../../components/Drawer";
import { OPERARIOS, PEDIDOS } from "../mock";
import { SECCIONES } from "../secciones";

test("la ficha aprobada enseña Pasar a Producción al autor y lo oculta al revisor", () => {
  const pedido = { ...PEDIDOS[0], situacion: "procesado" as const, ofs: [{
    ...PEDIDOS[0].ofs[0], autorId: "ivan", revisorId: "jaime", estado: "aprobada" as const,
    ajenaOT: false, detenida: false,
  }] };
  const noop = () => {};
  const props = { pedido, operarios: OPERARIOS, seccion: SECCIONES.ot,
    onClose: noop, onAssignPedido: noop, onCompletar: noop, onSetRevisor: noop,
    onTraspasarAutor: noop, onAccion: noop, onFichar: noop, onDesfichar: noop, onDesficharVarias: noop,
  };
  expect(renderToStaticMarkup(createElement(Drawer, { ...props, miId: "ivan" }))).toContain("Pasar a Producción");
  expect(renderToStaticMarkup(createElement(Drawer, { ...props, miId: "jaime" }))).not.toContain("Pasar a Producción");
});
