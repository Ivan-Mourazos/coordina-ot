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
