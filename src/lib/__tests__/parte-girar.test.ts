import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ParteEscaneado } from "../../components/ParteEscaneado";
import { giroIntercambia, siguienteGiro } from "../visor-pdf";

const pintar = () =>
  renderToStaticMarkup(
    createElement(ParteEscaneado, { codigo: "AR.26.03914", scanUrl: "/scan/AR.26.03914.pdf" }),
  );

test("hay un botón para girar el parte", () => {
  expect(pintar()).toContain("Girar el parte");
});

test("de salida el parte no está girado", () => {
  expect(pintar()).toContain("rotate(0deg)");
});

test("el botón da la vuelta entera en cuatro y empieza otra vez", () => {
  expect(siguienteGiro(0)).toBe(90);
  expect(siguienteGiro(90)).toBe(180);
  expect(siguienteGiro(180)).toBe(270);
  expect(siguienteGiro(270)).toBe(0);
});

test("solo el cuarto IMPAR intercambia ancho y alto, que es lo que llena el hueco", () => {
  // De pie dentro de un hueco apaisado: lo que era alto pasa a ser ancho.
  expect(giroIntercambia(90)).toBe(true);
  expect(giroIntercambia(270)).toBe(true);
  // Boca abajo mide igual que del derecho.
  expect(giroIntercambia(0)).toBe(false);
  expect(giroIntercambia(180)).toBe(false);
});

test("el botón dice en qué posición está la hoja, y lo dice donde lo lee un lector de pantalla", () => {
  // El nombre de un botón lo da el `aria-label`, no el `title`: con uno fijo,
  // quien no ve la pantalla no sabría si el parte está girado, que es justo lo
  // que el anillo de color le cuenta a quien sí la ve.
  expect(pintar()).toContain('aria-label="Girar el parte · ahora 0°"');
});
