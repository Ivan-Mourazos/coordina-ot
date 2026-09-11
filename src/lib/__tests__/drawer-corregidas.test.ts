import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Drawer } from "../../components/Drawer";
import { OPERARIOS, PEDIDOS } from "../mock";
import { SECCIONES } from "../secciones";
import type { OF } from "../types";

// Un pedido con varias OF devueltas que el autor ya ha corregido: antes había
// que darlas por corregidas una a una desde el "⋯" de cada fila.

const base = PEDIDOS[0].ofs[0];
const devuelta = (id: string): OF => ({
  ...base,
  id,
  codigo: `OF-${id}`,
  autorId: "ivan",
  revisorId: "jaime",
  estado: "devuelta",
  revisada: true,
  ajenaOT: false,
  detenida: false,
  fichandoRol: null,
});
const aprobada: OF = { ...devuelta("ok"), estado: "aprobada" };

const noop = () => {};
const pinta = (ofs: OF[], miId: string) =>
  renderToStaticMarkup(
    createElement(Drawer, {
      pedido: { ...PEDIDOS[0], situacion: "procesado" as const, ofs },
      operarios: OPERARIOS,
      seccion: SECCIONES.ot,
      miId,
      onClose: noop, onAssignPedido: noop, onCompletar: noop, onSetRevisor: noop,
      onTraspasarAutor: noop, onAccion: noop, onFichar: noop, onDesfichar: noop, onDesficharVarias: noop,
    }),
  );

test("con dos devueltas corregidas, el autor las da por corregidas de una vez", () => {
  expect(pinta([devuelta("a"), devuelta("b"), aprobada], "ivan")).toContain("Dar por corregidas las 2");
});

test("el revisor no ve ese botón: la corrección la da por buena quien la hizo", () => {
  expect(pinta([devuelta("a"), devuelta("b")], "jaime")).not.toContain("Dar por corregidas");
});

test("con una sola devuelta no sale: ya está el botón de su fila", () => {
  expect(pinta([devuelta("a"), aprobada], "ivan")).not.toContain("Dar por corregidas");
});
