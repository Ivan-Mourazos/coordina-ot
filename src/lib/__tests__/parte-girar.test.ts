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

test("el botón da la vuelta entera en cuatro y empieza otra vez", () => {
  expect(siguienteGiro(0)).toBe(90);
  expect(siguienteGiro(90)).toBe(180);
  expect(siguienteGiro(180)).toBe(270);
  expect(siguienteGiro(270)).toBe(0);
});

test("solo el cuarto IMPAR intercambia ancho y alto", () => {
  expect(giroIntercambia(90)).toBe(true);
  expect(giroIntercambia(270)).toBe(true);
  expect(giroIntercambia(0)).toBe(false);
  expect(giroIntercambia(180)).toBe(false);
});

test("el botón dice en qué posición está la hoja, y lo dice donde lo lee un lector de pantalla", () => {
  expect(pintar()).toContain('aria-label="Girar el parte · ahora 0°"');
});

test("de salida se ve con el visor propio: el giro ya no es un transform del marco", () => {
  const html = pintar();
  expect(html).not.toContain("<iframe");
  expect(html).not.toContain("rotate(");
});

test("mientras carga se ve la miniatura del parte", () => {
  expect(pintar()).toContain('src="/scan/AR.26.03914.png"');
});

test("siguen los dos botones de encaje, y dicen que se recuerdan", () => {
  const html = pintar();
  expect(html).toContain('aria-label="Ajustar al ancho"');
  expect(html).toContain('aria-label="Ajustar al alto"');
  // Lo dice la pista, y también para el lector de pantalla.
  expect(html).toContain('aria-description="Se recuerda para la próxima vez"');
});

test("los botones del carril no llevan title: saldría el rótulo gris del navegador encima de la pista", () => {
  expect(pintar()).not.toMatch(/<(button|a)[^>]*title=/);
});

test("cada botón del carril explica qué hace, no solo su nombre", () => {
  const html = pintar();
  for (const detalle of [
    "Ahora a 0°. El siguiente pedido se abre derecho.",
    "Con el visor de tu navegador, a pantalla completa",
    "Para guardarlo o mandarlo por correo",
    "Sale el PDF tal cual, no la pantalla",
    "Si prefieres el tuyo (Chrome, Adobe…). Se recuerda en este ordenador",
  ]) {
    expect(html).toContain('aria-description="' + detalle + '"');
  }
});

test("se puede pasar al visor del navegador", () => {
  expect(pintar()).toContain('aria-label="Ver con el visor del navegador"');
});

test("abrir en pestaña está siempre, para quien quiera su propio visor", () => {
  const html = pintar();
  expect(html).toContain('aria-label="Abrir el parte en otra pestaña"');
  expect(html).toContain('href="/scan/AR.26.03914.pdf"');
});
