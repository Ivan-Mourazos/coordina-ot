import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PedidoLinea } from "../../components/PedidoLinea";
import { OPERARIOS, PEDIDOS } from "../mock";

const noop = () => {};

function pinta(opts: { fichandoYo?: boolean } = {}) {
  const pedido = PEDIDOS[0];
  const ofs = pedido.ofs.map((o) => ({ ...o, ajenaOT: false, detenida: false }));
  return renderToStaticMarkup(
    createElement(PedidoLinea, {
      facet: { pedido: { ...pedido, ofs }, locationId: "ivan", ofs },
      fase: "sinEmpezar" as const,
      onOpen: noop,
      onFichar: noop,
      onDesficharVarias: noop,
      completarPedido: noop,
      operarios: OPERARIOS,
      ofIdsFichandoYo: opts.fichandoYo ? new Set(ofs.map((o) => o.id)) : undefined,
    }),
  );
}

test("la cuenta de OF se aparta cuando aparece el botón encima", () => {
  // Los botones se superponen al final de la fila y se tapaban con un fondo
  // SEMITRANSPARENTE, que no tapa: se leía "1 OF" a través de "Fichar".
  expect(pinta()).toContain("group-hover:invisible");
});

test("con mi reloj en marcha se aparta siempre: el botón de pausar está fijo", () => {
  const html = pinta({ fichandoYo: true });
  expect(html).toContain("Pausar");
  // `invisible` a secas, no solo al pasar el ratón: ese botón no se revela, ya
  // está ahí.
  expect(html).toMatch(/text-text-muted[^"]*\binvisible\b/);
});

test("los tiempos de la fila van en minutos enteros, sin segundos", () => {
  // "14m 7s" al lado de "36m" y "42m": en una lista que se recorre con la
  // vista, los segundos son ruido.
  expect(pinta()).not.toMatch(/\d+m \d+s/);
});

test("una OF detenida dice POR QUÉ no se puede fichar, en vez de no ofrecer nada", () => {
  // La regla es correcta —Producción la paró, no admite fichaje— pero desde la
  // fila no se veía: no había botón ni explicación, y parecía que la web se
  // había roto.
  const pedido = PEDIDOS[0];
  const ofs = pedido.ofs.map((o) => ({ ...o, ajenaOT: false, detenida: true }));
  const html = renderToStaticMarkup(
    createElement(PedidoLinea, {
      facet: { pedido: { ...pedido, ofs }, locationId: "ivan", ofs },
      fase: "sinEmpezar" as const,
      onOpen: noop, onFichar: noop, onDesficharVarias: noop, completarPedido: noop,
      operarios: OPERARIOS,
    }),
  );
  expect(html).toContain("Detenida por Producción");
  expect(html).not.toContain("⏱ Fichar");
});

test("en esperando revisión el motivo es de la fase, no de la OF", () => {
  // Ahí las OF sí son fichables: lo que pasa es que lo que se ficha es la
  // revisión, y le toca al revisor.
  const pedido = PEDIDOS[0];
  const ofs = pedido.ofs.map((o) => ({ ...o, ajenaOT: false, detenida: false }));
  const html = renderToStaticMarkup(
    createElement(PedidoLinea, {
      facet: { pedido: { ...pedido, ofs }, locationId: "ivan", ofs },
      fase: "esperandoRevision" as const,
      onOpen: noop, onFichar: noop, onDesficharVarias: noop, completarPedido: noop,
      operarios: OPERARIOS,
    }),
  );
  expect(html).toContain("Lo tiene el revisor");
});

test("la fila dice con el cursor que se puede pulsar, y el hueco de los botones no miente", () => {
  const html = pinta();
  // Abrir el pedido es la acción más usada de la fila, y la mano solo salía
  // sobre los botones de acción: la regla global vive en `@layer base` y ahí
  // la gana cualquier utilidad posterior.
  expect(html).toContain("cursor-pointer");
  // Y la franja de los botones no traga el clic cuando está vacía: tapa el
  // final de la fila, que es zona de "abrir el pedido".
  expect(html).toContain("pointer-events-none absolute inset-y-0 right-2");
});
