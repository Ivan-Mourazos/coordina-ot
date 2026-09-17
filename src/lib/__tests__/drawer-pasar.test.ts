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
    onTraspasarAutor: noop, onAccion: noop, onFichar: noop, onDesfichar: noop, onDesficharVarias: noop, onCerradoEnRps: noop, onGemelaReintentada: noop,
  };
  expect(renderToStaticMarkup(createElement(Drawer, { ...props, miId: "ivan" }))).toContain("Pasar a Producción");
  expect(renderToStaticMarkup(createElement(Drawer, { ...props, miId: "jaime" }))).not.toContain("Pasar a Producción");
});

test("con tres botones a la vez, la fila del rótulo se parte en vez de salirse del panel", () => {
  // En un pedido con trabajo por fichar, devueltas corregidas y OF listas para
  // revisar salen los tres: "Fichar las N", "Dar por corregidas las N" y
  // "Pasar las N a revisión". En un panel de 32rem no caben en la línea del
  // rótulo, y sin el salto el último se iba por el borde derecho.
  const base = PEDIDOS[0].ofs[0];
  const of = (estado: "en_curso" | "devuelta" | "por_revisar", i: number) => ({
    ...base, id: `of-${i}`, codigo: `OF-${i}`, estado, autorId: "ivan", revisorId: "jaime",
    ajenaOT: false, detenida: false,
  });
  const noop = () => {};
  const html = renderToStaticMarkup(createElement(Drawer, {
    pedido: { ...PEDIDOS[0], situacion: "procesado" as const,
      ofs: [of("en_curso", 1), of("devuelta", 2), of("por_revisar", 3)] },
    operarios: OPERARIOS, seccion: SECCIONES.ot, miId: "ivan",
    onClose: noop, onAssignPedido: noop, onCompletar: noop, onSetRevisor: noop,
    onTraspasarAutor: noop, onAccion: noop, onFichar: noop, onDesfichar: noop,
    onDesficharVarias: noop, onCerradoEnRps: noop, onGemelaReintentada: noop,
  }));
  expect(html).toContain("flex-wrap");
  // Y sin `shrink-0` en el grupo de botones, que es lo que empujaba al último
  // fuera en vez de dejarlo bajar.
  expect(html).not.toContain("ml-auto flex shrink-0 items-center gap-1.5");
});
