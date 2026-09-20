import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Drawer } from "../../components/Drawer";
import { OPERARIOS, PEDIDOS } from "../mock";
import { SECCIONES } from "../secciones";
import type { OF } from "../types";

// ─── Recuperar para plantear, el pedido entero ───────────────────────────────
// Mandar un pedido a revisar es UN gesto ("Pasar las 3 a revisión"), pero
// deshacerlo eran tantos como OF: abrir el "⋯" de cada fila y confirmar. El
// bloque del pedido ofrece ahora el camino de vuelta, con el mismo criterio que
// «Dar por corregidas las N»: solo del autor, solo desde `por_revisar` y desde
// dos OF (con una, el "⋯" de su fila hace lo mismo).

const noop = () => {};
const base = PEDIDOS[0].ofs[0];

const enEspera = (n: number, autorId: string): OF => ({
  ...base,
  id: `023210${n}:9`,
  codigo: `023210${n}`,
  autorId,
  revisorId: "jaime",
  estado: "por_revisar",
  ajenaOT: false,
  detenida: false,
  fichandoRol: null,
});

const pinta = (ofs: OF[], miId: string) =>
  renderToStaticMarkup(
    createElement(Drawer, {
      pedido: { ...PEDIDOS[0], situacion: "procesado" as const, ofs },
      operarios: OPERARIOS,
      seccion: SECCIONES.ot,
      miId,
      onClose: noop, onAssignPedido: noop, onCompletar: noop, onSetRevisor: noop,
      onTraspasarAutor: noop, onAccion: noop, onFichar: noop, onDesfichar: noop,
      onDesficharVarias: noop, onCerradoEnRps: noop, onGemelaReintentada: noop,
    }),
  );

test("con dos OF mías esperando revisión, el pedido ofrece recuperarlas de golpe", () => {
  const html = pinta([enEspera(1, "ivan"), enEspera(2, "ivan")], "ivan");
  expect(html).toContain("Recuperar las 2");
});

test("con una sola no: el «⋯» de su fila ya lo hace", () => {
  expect(pinta([enEspera(1, "ivan")], "ivan")).not.toContain("Recuperar las");
});

test("no se le ofrece a quien no es el autor", () => {
  // Jaime es el revisor nombrado: recuperar el planteo es cosa de quien lo
  // planteó, no de quien lo iba a mirar.
  const html = pinta([enEspera(1, "ivan"), enEspera(2, "ivan")], "jaime");
  expect(html).not.toContain("Recuperar las");
});
