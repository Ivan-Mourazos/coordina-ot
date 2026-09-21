import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Drawer } from "../../components/Drawer";
import { OPERARIOS, PEDIDOS } from "../mock";
import { SECCIONES } from "../secciones";
import type { OF } from "../types";

// ─── «Coger» en la ficha ─────────────────────────────────────────────────────
// Lo mismo que en el panel de un compañero: sobre una OF que lleva otra persona
// se ofrece quedársela, con confirmación (la pone el Board). En una OF propia,
// o sin autor, no tiene sentido.

const noop = () => {};
const base = PEDIDOS[0].ofs[0];
const de = (n: number, autorId: string | null): OF => ({
  ...base, id: `023220${n}:9`, codigo: `023220${n}`, autorId, revisorId: null,
  estado: "en_curso", ajenaOT: false, detenida: false, fichandoRol: null,
});

const pinta = (ofs: OF[], miId: string) =>
  renderToStaticMarkup(
    createElement(Drawer, {
      pedido: { ...PEDIDOS[0], situacion: "procesado" as const, ofs },
      operarios: OPERARIOS, seccion: SECCIONES.ot, miId,
      onClose: noop, onAssignPedido: noop, onCompletar: noop, onSetRevisor: noop,
      onTraspasarAutor: noop, onCoger: noop, onAccion: noop, onFichar: noop, onDesfichar: noop,
      onDesficharVarias: noop, onCerradoEnRps: noop, onGemelaReintentada: noop,
    }),
  );

test("en la OF de otra persona se ofrece cogerla", () => {
  expect(pinta([de(1, "jaime")], "ivan")).toContain(">Coger<");
});

test("con dos de otra persona, también de golpe", () => {
  expect(pinta([de(1, "jaime"), de(2, "jaime")], "ivan")).toContain("Coger las 2");
});

test("en la mía, no", () => {
  expect(pinta([de(1, "ivan")], "ivan")).not.toContain(">Coger<");
});
