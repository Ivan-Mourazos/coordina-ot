import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { HistorialOFsCompactas } from "../../components/HistorialOFsCompactas";
import type { HistorialOF } from "../historial";

const taller: HistorialOF = { codigo: "0231922", descripcion: "ADAPTAR LONA DEL CLIENTE", centro: "taller", tiempoImputadoMin: 34, quien: ["167", "61"] };

test("AR.26.04413 enseña su OF de Taller al consultar desde OT", () => {
  const html = renderToStaticMarkup(createElement(HistorialOFsCompactas, { ofs: [taller], seccion: "ot" }));
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
  const html = renderToStaticMarkup(createElement(HistorialOFsCompactas, { ofs, seccion: "ot" }));
  expect(html.match(/<li /g)).toHaveLength(2);
  expect(html).toContain("OT · 7m");
  expect(html).toContain("Diseño · 12m");
  expect(html).toContain("Taller · 34m");
  expect(html).toContain("Taller · 0m");
  expect(html).toContain("Iván");
  expect(html).not.toContain("Carrón");
  const diseno = renderToStaticMarkup(createElement(HistorialOFsCompactas, { ofs, seccion: "diseno" }));
  expect(diseno).toContain("Carrón");
  expect(diseno).not.toContain("Iván");
});

test("las personas salen con su tiempo, de más a menos, y sin rol", () => {
  const of: HistorialOF = {
    ...taller,
    centro: "ot",
    tiempoImputadoMin: 20,
    personas: [
      { nombre: "Jaime Vázquez", min: 5 },
      { nombre: "Adrián Quinteiro", min: 15 },
      { nombre: "Tamara Villar", min: 0 },
    ],
  };
  const html = renderToStaticMarkup(createElement(HistorialOFsCompactas, { ofs: [of], seccion: "ot" }));
  expect(html.indexOf("Adrián Quinteiro")).toBeLessThan(html.indexOf("Jaime Vázquez"));
  expect(html).not.toContain("Tamara Villar");
  expect(html).not.toContain("Planteo");
});

test("con horas en RPS manda RPS: el reloj de la web no se suma ni se enseña aparte", () => {
  const of: HistorialOF = {
    ...taller,
    centro: "ot",
    tiempoImputadoMin: 47,
    personas: [{ nombre: "Tamara Villar", min: 47 }],
    rol: { planteoMin: 5, revisionMin: 0, planteo: [{ nombre: "Iván Sánchez", min: 5 }], revision: [] },
  };
  const html = renderToStaticMarkup(createElement(HistorialOFsCompactas, { ofs: [of], seccion: "ot" }));
  expect(html).toContain("Tamara Villar");
  expect(html).not.toContain("Iván Sánchez");
});
