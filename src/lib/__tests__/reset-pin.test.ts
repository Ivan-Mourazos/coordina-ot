import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ResetPin } from "../../components/ResetPin";

test("va plegado: doce nombres sueltos convertían el menú en una lista de gente", () => {
  const html = renderToStaticMarkup(createElement(ResetPin));
  expect(html).toContain("PIN olvidado");
  expect(html).toContain('aria-expanded="false"');
  // Plegado no se explica todavía qué hace: eso sale al abrirlo.
  expect(html).not.toContain("elige uno nuevo la próxima vez");
});

test("el botón dice a qué lista apunta, para el lector de pantalla", () => {
  const html = renderToStaticMarkup(createElement(ResetPin));
  expect(html).toContain('aria-controls="reset-pin-lista"');
});
