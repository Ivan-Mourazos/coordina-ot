import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { BotonVolverAPlantear } from "../../components/Drawer";

const html = () =>
  renderToStaticMarkup(
    createElement(BotonVolverAPlantear, { label: "Volver a plantear", onPulsar() {} }),
  );

test("se lee en tema oscuro: tinta normal, no la de texto secundario", () => {
  expect(html()).toContain("text-text");
  expect(html()).not.toContain("text-text-muted");
});

test("con relieve, como los demás chips de la ficha, y no un borde gris", () => {
  expect(html()).toContain("chip-3d");
  expect(html()).not.toContain("border-border");
});

test("a su propia línea: es la única salida de esa OF, no un botón más de la fila", () => {
  expect(html()).toContain("w-full");
  expect(html()).toContain("order-first");
});

test("dice para qué sirve, que la OF sigue terminada en RPS hasta que alguien fiche", () => {
  expect(html()).toContain("Volver a plantear");
  expect(html()).toContain("En RPS sigue terminada");
});
