import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { HistorialOFsCompactas } from "../../components/HistorialOFsCompactas";
import type { HistorialOF } from "../historial";

const taller: HistorialOF = { codigo: "0231922", descripcion: "ADAPTAR LONA DEL CLIENTE", centro: "taller", tiempoImputadoMin: 34, quien: ["167", "61"] };
const otra: HistorialOF = { codigo: "0231999", descripcion: "OTRA OF DEL PEDIDO", centro: "ot", tiempoImputadoMin: 3, quien: [] };
const pinta = (ofs: HistorialOF[], seccion: "ot" | "diseno" = "ot") =>
  renderToStaticMarkup(createElement(HistorialOFsCompactas, { ofs, seccion }));

test("AR.26.04413 enseña su OF de Taller al consultar desde OT", () => {
  const html = pinta([taller]);
  expect(html).toContain("0231922");
  expect(html).toContain("ADAPTAR LONA DEL CLIENTE");
  expect(html).not.toContain("Sin OF");
});

test("una OF compartida ocupa una sola fila y no enseña personas de otros centros", () => {
  const rol = (nombre: string, min: number) => ({ planteoMin: min, revisionMin: 0, planteo: [{ nombre, min }], revision: [] });
  const ofs: HistorialOF[] = [
    { ...taller, centro: "ot", tiempoImputadoMin: 7, rol: rol("Iván", 7) },
    { ...taller, centro: "diseno", tiempoImputadoMin: 12, rol: rol("Carrón", 12) },
    taller,
    { ...taller, codigo: "0231923", tiempoImputadoMin: 0 },
  ];
  const html = pinta(ofs);
  expect(html.match(/<li /g)).toHaveLength(2);
  expect(html).toContain("Iván");
  expect(html).not.toContain("Carrón");
  const diseno = pinta(ofs, "diseno");
  expect(diseno).toContain("Carrón");
  expect(diseno).not.toContain("Iván");
});

test("en la lista, cada OF va en las columnas de la fila y el botón solo en la primera", () => {
  const html = renderToStaticMarkup(createElement(HistorialOFsCompactas, {
    ofs: [{ ...otra, codigo: "0232086" }, { ...otra, codigo: "0232087" }],
    seccion: "ot",
    columnas: "grid grid-cols-[28px_136px_minmax(0,1fr)]",
    accion: createElement("button", null, "Tareas y tiempos"),
  }));
  expect(html.match(/<li class="grid grid-cols-\[28px_136px_minmax\(0,1fr\)\]/g)).toHaveLength(2);
  expect(html.match(/Tareas y tiempos/g)).toHaveLength(1);
  expect(html.indexOf("Tareas y tiempos")).toBeLessThan(html.indexOf("0232087"));
});

// Con varias OF, cada una dice quién la hizo: es información que la fila del
// pedido (que suma todas) no da.
const conGente: HistorialOF = {
  ...taller,
  centro: "ot",
  tiempoImputadoMin: 20,
  personas: [
    { nombre: "Jaime Vázquez", min: 5 },
    { nombre: "Adrián Quinteiro", min: 15 },
    { nombre: "Tamara Villar", min: 0 },
  ],
};

test("con varias OF, las personas de cada una salen con su tiempo, de más a menos, y sin rol", () => {
  const html = pinta([conGente, otra]);
  expect(html.indexOf("Adrián Quinteiro")).toBeLessThan(html.indexOf("Jaime Vázquez"));
  expect(html).not.toContain("Tamara Villar");
  expect(html).not.toContain("Planteo");
});

test("con una sola OF no repite las personas: ya están en la fila del pedido", () => {
  const html = pinta([conGente]);
  expect(html).toContain("0231922");
  expect(html).not.toContain("Adrián Quinteiro");
});

test("con horas en RPS manda RPS: el reloj de la web no se suma ni se enseña aparte", () => {
  const of: HistorialOF = {
    ...taller,
    centro: "ot",
    tiempoImputadoMin: 47,
    personas: [{ nombre: "Tamara Villar", min: 47 }],
    rol: { planteoMin: 5, revisionMin: 0, planteo: [{ nombre: "Iván Sánchez", min: 5 }], revision: [] },
  };
  const html = pinta([of, otra]);
  expect(html).toContain("Tamara Villar");
  expect(html).not.toContain("Iván Sánchez");
});

// El tiempo por centro se va de la línea de la OF: en un pedido de una sola OF
// repetía el total que la fila del pedido ya enseña justo encima, y el reparto
// entre centros vive ahora en «Tareas y tiempos», que es donde además se ve por
// tarea y por persona.
test("la línea de la OF ya no lleva el tiempo del centro", () => {
  const html = pinta([taller]);
  expect(html).toContain("0231922");
  expect(html).toContain("ADAPTAR LONA DEL CLIENTE");
  expect(html).not.toContain("Taller · 34m");
  expect(html).not.toContain("Sin tiempo");
});

test("tampoco con varias OF y varios centros", () => {
  const html = pinta([
    { ...taller, centro: "ot", tiempoImputadoMin: 7 },
    taller,
    { ...otra, codigo: "0231999" },
  ]);
  expect(html).not.toContain("OT · 7m");
  expect(html).not.toContain("Taller · 34m");
});

test("en la lista, el botón va al final de la línea, detrás de la gente", () => {
  const html = renderToStaticMarkup(createElement(HistorialOFsCompactas, {
    ofs: [conGente, { ...otra, codigo: "0232087" }],
    seccion: "ot",
    columnas: "grid grid-cols-[28px_136px_minmax(0,1fr)_112px_minmax(150px,24%)_64px]",
    accion: createElement("button", null, "Tareas y tiempos"),
  }));
  // Pegado a la descripción empujaba el texto de la OF; al final cae bajo el
  // tiempo del pedido, que es la columna con la que se corresponde.
  expect(html.indexOf("Adrián Quinteiro")).toBeLessThan(html.indexOf("Tareas y tiempos"));
  expect(html.match(/Tareas y tiempos/g)).toHaveLength(1);
});

test("en la ficha, cada OF es una fila hundida de dos renglones y no una línea apretada", () => {
  // Trece OF con dos personas cada una dejaban la descripción en "LONA
  // ESCENAR…": la gente se comía el ancho de la misma línea. Arriba qué es y
  // cuánto costó; debajo, quién.
  const html = pinta([taller, otra]);
  expect(html).toContain("ring-1 ring-border");
  // El tiempo de la OF, que en la versión en columnas no se pinta porque lo
  // dice la fila del pedido de encima. Aquí no hay fila de pedido.
  expect(html).toContain("tabular-nums");
  expect(html).toContain("34m");
  // Sin `columnas` no se pinta la rejilla de la lista.
  expect(html).not.toContain("grid-cols-");
});
