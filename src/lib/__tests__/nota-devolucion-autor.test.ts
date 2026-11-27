import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { NotaDevolucion } from "@/components/NotaDevolucion";

const obs = "[2;p11,13] ✗ Las medidas — Faltan 3 cm en el lateral\n✗ Las cotas del croquis — Falta la cota del ollao\nRevisa la etiqueta.";
const pintar = (props: Partial<Parameters<typeof NotaDevolucion>[0]> = {}) =>
  renderToStaticMarkup(createElement(NotaDevolucion, { observacion: obs, ...props }));

test("el autor ve primero qué hacer, el paso detrás, y las indicaciones extra sin casilla", () => {
  const html = pintar({ marcarComo: "of-1" });
  expect(html).toContain("Qué corregir");
  expect(html.indexOf("Faltan 3 cm en el lateral")).toBeLessThan(html.indexOf("Las medidas"));
  // Dos casillas: una por punto. La indicación extra va como texto.
  expect(html.match(/type="checkbox"/g)).toHaveLength(2);
  expect(html).toContain("Indicaciones extra");
  expect(html).toContain("Revisa la etiqueta.");
  expect(html).toContain("0 de 2 hechas");
  // Sin la etiqueta de causa ni el prefijo de la codificación.
  expect(html).not.toContain("[2;p11,13]");
});

test("ya reenviada, se pliega en gris con cuántos puntos llevaba", () => {
  const html = pintar({ marcarComo: "of-1", enviada: true });
  expect(html).toContain("Corrección enviada · 2 puntos");
  expect(html).not.toContain("Faltan 3 cm");
  // El revisor la tiene abierta, y sin casillas: no es quien corrige.
  const rev = pintar({ enviada: true, abrirEnviada: true });
  expect(rev).toContain("Faltan 3 cm");
  expect(rev).not.toContain('type="checkbox"');
});
