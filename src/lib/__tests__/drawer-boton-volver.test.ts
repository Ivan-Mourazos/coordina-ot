import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { BotonVolverAPlantear, DetalleVenta } from "../../components/Drawer";

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

test("lo que se vendió va plegado: son 160 caracteres de media y hasta 400", () => {
  const html = renderToStaticMarkup(
    createElement(DetalleVenta, {
      texto: "POR CONFECCION E INSTALACION DE TOLDO VERTICAL, DE MEDIDAS 3,20 X 2,10 M",
    }),
  );
  expect(html).toContain("Qué se vendió");
  expect(html).toContain('aria-expanded="false"');
  // Cerrado no escribe el texto: a la vista, cada OF sería un párrafo y la
  // ficha de un pedido de cinco, un muro.
  expect(html).not.toContain("MEDIDAS 3,20");
});

test("el botón dice a qué apunta, para el lector de pantalla", () => {
  const html = renderToStaticMarkup(createElement(DetalleVenta, { texto: "x" }));
  expect(html).toMatch(/aria-controls="[^"]+"/);
});
