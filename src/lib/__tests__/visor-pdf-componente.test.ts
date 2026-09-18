import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { VisorPdf } from "../../components/VisorPdf/VisorPdf";

const pintar = (poster?: string) =>
  renderToStaticMarkup(
    createElement(VisorPdf, { url: "/x.pdf", encaje: "Fit", giro: 0, titulo: "Pedido X", poster }),
  );

test("el hueco se anuncia con el nombre del documento", () => {
  expect(pintar()).toContain('aria-label="Pedido X"');
});

test("mientras pdf.js arranca se ve la miniatura, no un hueco en blanco", () => {
  expect(pintar("/x.png")).toContain('src="/x.png"');
});

test("sin miniatura no pinta una imagen rota", () => {
  expect(pintar()).not.toContain("<img");
});
