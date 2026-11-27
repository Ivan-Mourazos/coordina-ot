import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { BotonesRevisor, PedirRevisor } from "../../components/PedirRevisor";
import { OPERARIOS } from "../mock";

const noop = () => {};

test("los compañeros elegibles aparecen como botones con avatar y en el mismo orden", () => {
  const autores = [OPERARIOS[0].id, OPERARIOS[2].id];
  const html = renderToStaticMarkup(createElement(PedirRevisor, {
    operarios: OPERARIOS, excluirIds: [...autores, null], onConfirmar: noop, onCancelar: noop,
  }));
  const nombres = [...html.matchAll(/aria-label="Elegir a ([^"]+) como revisor"/g)].map((m) => m[1]);
  const elegibles = OPERARIOS.filter((o) => !autores.includes(o.id));
  expect(nombres).toEqual(elegibles.map((o) => o.nombre));
  for (const op of elegibles) expect(html).toContain(op.iniciales);
  expect(html.match(/type="button"/g)).toHaveLength(elegibles.length + 1);
  // Se vuelve sin elegir con la flecha de delante (antes «Cancelar» al final).
  expect(html).toContain('aria-label="Volver sin elegir revisor"');
  expect(html).toContain("focus-visible:outline");
  expect(html).not.toContain('role="combobox"');
  expect(html).not.toContain('aria-haspopup="listbox"');
  expect(html).not.toContain("Confirmar");
  expect(html).not.toContain("Aceptar");
});

test("el revisor inicial está señalado sin alterar las opciones ni su orden", () => {
  const actual = OPERARIOS[1];
  const html = renderToStaticMarkup(createElement(BotonesRevisor, {
    operarios: OPERARIOS, excluirIds: [], valorActual: actual.id, miId: actual.id, onElegir: noop,
  }));
  expect(html).toContain(`aria-label="Elegir a ${actual.nombre} como revisor" aria-pressed="true"`);
  expect(html).toContain(`${actual.nombre} (tú)`);
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
});

test("durante el envío se pueden deshabilitar todos los nombres", () => {
  const html = renderToStaticMarkup(createElement(BotonesRevisor, {
    operarios: OPERARIOS, excluirIds: [], onElegir: noop, deshabilitado: true,
  }));
  expect(html.match(/disabled=""/g)).toHaveLength(OPERARIOS.length);
});

test("sin compañeros elegibles se explica el motivo y la flecha de volver sigue disponible", () => {
  const html = renderToStaticMarkup(createElement(PedirRevisor, {
    operarios: OPERARIOS, excluirIds: OPERARIOS.map((o) => o.id), onConfirmar: noop, onCancelar: noop,
  }));
  expect(html).toContain("No hay compañeros disponibles para revisar.");
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html).toContain("Volver sin elegir revisor");
  expect(html).not.toContain('disabled=""');
});

test("con nombreCorto en la fila del tablero los nombres envuelven sin forzar scroll horizontal", () => {
  const html = renderToStaticMarkup(createElement(PedirRevisor, {
    operarios: OPERARIOS, excluirIds: [OPERARIOS[0].id], onConfirmar: noop, onCancelar: noop, nombreCorto: true,
  }));
  expect(html).toContain("flex-wrap");
  expect(html).not.toContain("flex-nowrap");
});
