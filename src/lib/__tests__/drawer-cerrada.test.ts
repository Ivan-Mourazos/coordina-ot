import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Drawer } from "../../components/Drawer";
import { OPERARIOS, PEDIDOS } from "../mock";
import { SECCIONES } from "../secciones";
import { esFichable, motivoNoFichable } from "../fichaje";
import type { OF } from "../types";

const noop = () => {};
const base = PEDIDOS[0].ofs[0];
const pinta = (ofs: OF[], miId: string) =>
  renderToStaticMarkup(
    createElement(Drawer, {
      pedido: { ...PEDIDOS[0], situacion: "procesado" as const, ofs },
      operarios: OPERARIOS, seccion: SECCIONES.ot, miId,
      onClose: noop, onAssignPedido: noop, onCompletar: noop, onSetRevisor: noop,
      onTraspasarAutor: noop, onAccion: noop, onFichar: noop, onDesfichar: noop,
      onDesficharVarias: noop, onCerradoEnRps: noop, onGemelaReintentada: noop,
    }),
  );

const cerrada = (modo: "activo" | "ensayo", gemelaSinEscribir?: string): OF => ({
  ...base, id: "0232086:9", codigo: "0232086", autorId: "ivan", revisorId: null, estado: "aprobada",
  ajenaOT: false, detenida: false, fichandoRol: null,
  cerradaRps: { at: "2026-09-15T11:42:00.000Z", por: "ivan", modo, gemelaSinEscribir },
});
const enCurso: OF = {
  ...base, id: "0232087:9", codigo: "0232087", autorId: "ivan", revisorId: null, estado: "en_curso",
  ajenaOT: false, detenida: false, fichandoRol: null,
};

test("una OF cerrada en RPS sale en su cajón, con el distintivo y sin las acciones normales de aprobada", () => {
  const html = pinta([cerrada("activo")], "ivan");
  expect(html).toContain("Ver 1 cerrada en RPS");
  // Quién y cuándo, sin abrir el cajón.
  expect(html).toMatch(/0232086 — [^<]+, 15\/09\/26 \d\d:42/);
  expect(html).toContain("Ninguna OF de este pedido es trabajo de");
  expect(html).not.toContain("Reabrir revisión");
  expect(html).not.toContain("Recuperar para corregir");
});

test("fuera de la lista de trabajo: la OF cerrada no sale entre las OF de OT, y la otra sí", () => {
  const html = pinta([cerrada("activo"), enCurso], "ivan");
  // React mete separadores `<!-- -->` entre trozos de texto: se admiten.
  expect(html).toMatch(/Órdenes de fabricación \((?:<!-- -->)*1(?:<!-- -->)*[)<]/);
  expect(html).toContain("0232087");
  // Cerrada el cajón, la fila de la cerrada no se pinta: su código solo sale
  // en la línea de resumen.
  expect(html.match(/0232086/g)?.length).toBe(1);
});

test("«Reintentar la N» (Confirmado con Iván, punto 4): sale para el autor cuando la trampa dejó una gemela sin escribir", () => {
  const html = pinta([cerrada("activo", "02")], "ivan");
  expect(html).toContain("Reintentar la 02");
});

test("«Reintentar la N» no sale para otro técnico, aunque sea el mismo pedido", () => {
  const html = pinta([cerrada("activo", "02")], "tamara");
  expect(html).not.toContain("Reintentar la 02");
});

test("«Reintentar la N» no sale sin gemela pendiente (el caso normal, sin trampa)", () => {
  const html = pinta([cerrada("activo")], "ivan");
  expect(html).not.toContain("Reintentar la");
});

test("la fila de una cerrada no ofrece fichar, tampoco si se cerró en modo prueba", () => {
  // Pintar la fila exige abrir el cajón, y eso es estado del cliente que
  // `renderToStaticMarkup` no puede tocar. Se prueba lo que decide el botón
  // del reloj de `AccionesOF`, que es `esFichable` sobre el mismo `of`.
  expect(esFichable(cerrada("ensayo"))).toBe(false);
  expect(motivoNoFichable(cerrada("ensayo"))).toBe("Dada por terminada en RPS");
});
