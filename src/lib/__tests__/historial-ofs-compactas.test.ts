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
  expect(html).toContain("Taller · 34m");
  expect(html).not.toContain("Sin OF");
});

test("una OF compartida ocupa una sola fila y separa los tiempos sin mostrar personas de otros centros", () => {
  const rol = (nombre: string, min: number) => ({ planteoMin: min, revisionMin: 0, planteo: [{ nombre, min }], revision: [] });
  const ofs: HistorialOF[] = [
    { ...taller, centro: "ot", tiempoImputadoMin: 7, rol: rol("Iván", 7) },
    { ...taller, centro: "diseno", tiempoImputadoMin: 12, rol: rol("Carrón", 12) },
    taller,
    { ...taller, codigo: "0231923", tiempoImputadoMin: 0 },
  ];
  const html = pinta(ofs);
  expect(html.match(/<li /g)).toHaveLength(2);
  expect(html).toContain("OT · 7m");
  expect(html).toContain("Diseño · 12m");
  expect(html).toContain("Taller · 34m");
  expect(html).toContain("Iván");
  expect(html).not.toContain("Carrón");
  const diseno = pinta(ofs, "diseno");
  expect(diseno).toContain("Carrón");
  expect(diseno).not.toContain("Iván");
});

test("solo salen los centros con tiempo, con la sección consultada delante", () => {
  const ofs: HistorialOF[] = [
    { ...taller, centro: "diseno", tiempoImputadoMin: 0 },
    { ...taller, centro: "ot", tiempoImputadoMin: 4 },
    taller,
    { ...taller, codigo: "0231923", tiempoImputadoMin: 0 },
  ];
  const html = pinta(ofs);
  expect(html).not.toContain("0m");
  expect(html.indexOf("OT · 4m")).toBeLessThan(html.indexOf("Taller · 34m"));
  expect(html).toContain("Sin tiempo");
  const diseno = pinta([{ ...taller, centro: "ot", tiempoImputadoMin: 4 }, { ...taller, centro: "diseno", tiempoImputadoMin: 9 }], "diseno");
  expect(diseno.indexOf("Diseño · 9m")).toBeLessThan(diseno.indexOf("OT · 4m"));
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
