import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { CabeceraFicha } from "../../components/MarcoFicha";

test("la cabecera lleva los datos de identidad del pedido, que no se van al bajar", () => {
  const html = renderToStaticMarkup(
    createElement(CabeceraFicha, {
      codigo: "AR.26.03914", prioridad: 3, cliente: "MAHOU", negocio: "NOVA CAMELIAS",
      datos: ["4 piezas", "Madrid"], familias: ["toldos", "lona"],
    }),
  );
  expect(html).toContain("AR.26.03914");
  expect(html).toContain("MAHOU");
  expect(html).toContain("NOVA CAMELIAS");
  expect(html).toContain("4 piezas");
  expect(html).toContain("Madrid");
});

test("sin datos ni familias no aparece el tercer renglón vacío", () => {
  const html = renderToStaticMarkup(
    createElement(CabeceraFicha, { codigo: "AR.26.03914", cliente: "MAHOU" }),
  );
  expect(html).toContain("AR.26.03914");
  // Ni el separador suelto ni una lista vacía.
  expect(html).not.toContain("·</span>");
});

test("un pedido sin ciudad de entrega no deja un hueco donde iría", () => {
  const html = renderToStaticMarkup(
    createElement(CabeceraFicha, {
      codigo: "AR.26.03914", cliente: "MAHOU", datos: ["1 pieza"], familias: [],
    }),
  );
  expect(html).toContain("1 pieza");
  expect(html).not.toContain("· ·");
});
