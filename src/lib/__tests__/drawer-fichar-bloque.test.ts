import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Drawer } from "../../components/Drawer";
import { OPERARIOS, PEDIDOS } from "../mock";
import { SECCIONES } from "../secciones";
import type { OF } from "../types";

// «Fichar» en bloque solo lleva trabajo MÍO pendiente (Iván, 26/11/2026): ni
// las aprobadas ni las de otra persona. Antes «Fichar las 13» en un pedido de
// Alberto fichaba sus 13 OF a nombre de quien pulsaba.

const base = PEDIDOS[0].ofs[0];
const of = (id: string, cambios: Partial<OF> = {}): OF => ({
  ...base,
  id,
  codigo: `OF-${id}`,
  autorId: "ivan",
  revisorId: null,
  estado: "en_curso",
  revisada: false,
  ajenaOT: false,
  detenida: false,
  fichandoRol: null,
  fichable: true,
  cerradaRps: undefined,
  tiempoPlanteoMin: 0,
  tiempoRevisionMin: 0,
  ...cambios,
});

const noop = () => {};
const pinta = (ofs: OF[], miId: string, conCoger = false) =>
  renderToStaticMarkup(
    createElement(Drawer, {
      pedido: { ...PEDIDOS[0], situacion: "procesado" as const, ofs },
      operarios: OPERARIOS,
      seccion: SECCIONES.ot,
      miId,
      onClose: noop, onAssignPedido: noop, onCompletar: noop, onPasarRevision: async () => true,
      onTraspasarAutor: noop, onAccion: noop, onFichar: noop, onDesfichar: noop, onDesficharVarias: noop, onCerradoEnRps: noop, onGemelaReintentada: noop,
      ...(conCoger ? { onCoger: noop } : {}),
    }),
  );

test("todas mías y en curso: «Fichar las N»", () => {
  expect(pinta([of("a"), of("b"), of("c")], "ivan")).toContain("Fichar las 3");
});

test("una aprobada y una de otra persona se quedan fuera, y el botón dice cuántas entran", () => {
  const html = pinta([of("a"), of("b"), of("c"), of("ok", { estado: "aprobada" }), of("t", { autorId: "tamara" })], "ivan");
  expect(html).toContain("Fichar 3 de 5");
  expect(html).toContain("OF-ok ya aprobada");
  expect(html).toMatch(/OF-t es de \p{L}+/u);
});

test("con tiempo ya fichado dice «Reanudar», como la fila del tablero", () => {
  expect(pinta([of("a", { tiempoPlanteoMin: 30 }), of("b")], "ivan")).toContain("Reanudar las 2");
});

test("pedido de otro: no hay «Fichar» principal; lo principal es Coger y fichar va a «⋯»", () => {
  const html = pinta([of("a", { autorId: "alberto" }), of("b", { autorId: "alberto" })], "ivan", true);
  expect(html).not.toContain("Fichar las");
  expect(html).toContain("Coger las 2");
  expect(html).toContain("Fichar para ayudar (2)");
});

test("las aprobadas solas no ofrecen fichar en bloque", () => {
  expect(pinta([of("a", { estado: "aprobada" }), of("b", { estado: "aprobada" })], "ivan")).not.toContain("Fichar las");
});
