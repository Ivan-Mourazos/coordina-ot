import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ParteEscaneado, giroIntercambia, siguienteGiro } from "../../components/ParteEscaneado";

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
