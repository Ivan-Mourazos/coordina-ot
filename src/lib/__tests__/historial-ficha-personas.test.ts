import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistorialCentros } from "../../components/HistorialDrawer";
import { centrosConDesglose } from "../historial-centros";
import type { HistorialOF } from "../historial";

// En la ficha, un desglose solo sale si dice algo que el de arriba no dice.
// En AR.26.04488 (1 OF) "Adrián Quinteiro 10m · Jaime Vázquez 2m" salía en el
// centro y otra vez dentro de la OF: los mismos nombres y minutos dos veces.

const of = (codigo: string, centro: HistorialOF["centro"], personas: { nombre: string; min: number }[]): HistorialOF => ({
  codigo,
  descripcion: `OF ${codigo}`,
  centro,
  tiempoImputadoMin: personas.reduce((n, p) => n + p.min, 0),
  quien: personas.map((p) => p.nombre),
  personas,
});

const veces = (html: string, texto: string) => html.split(texto).length - 1;
const pinta = (ofs: HistorialOF[]) => renderToStaticMarkup(createElement(HistorialCentros, { ofs, seccion: "ot" }));

describe("personas en la ficha del Historial", () => {
  it("con una sola OF, las personas salen una vez: en el centro", () => {
    const html = pinta([of("0232070", "ot", [{ nombre: "Adrián Quinteiro", min: 10 }, { nombre: "Jaime Vázquez", min: 2 }])]);
    expect(html).toContain("Tiempos por persona de Oficina Técnica");
    expect(veces(html, "Adrián Quinteiro")).toBe(1);
  });

  it("con varias OF en el centro, cada OF dice además quién la hizo", () => {
    const html = pinta([
      of("0000001", "ot", [{ nombre: "Adrián Quinteiro", min: 10 }]),
      of("0000002", "ot", [{ nombre: "Jaime Vázquez", min: 6 }]),
    ]);
    // Una vez en el centro y otra en su OF.
    expect(veces(html, "Adrián Quinteiro")).toBe(2);
    expect(veces(html, "Jaime Vázquez")).toBe(2);
  });

  it("un pedido Solo Taller visto desde OT enseña a la gente de Taller, igual que la fila", () => {
    const html = pinta([of("0202576", "taller", [{ nombre: "Luis Santos", min: 275 }, { nombre: "Hugo Millán", min: 92 }])]);
    expect(html).toContain("Tiempos por persona de Taller");
    expect(html.indexOf("Luis Santos")).toBeLessThan(html.indexOf("Hugo Millán"));
  });

  it("con trabajo de la sección, el Taller solo da el total", () => {
    const html = pinta([
      of("0232070", "ot", [{ nombre: "Adrián Quinteiro", min: 10 }]),
      of("0232070", "taller", [{ nombre: "Luis Santos", min: 40 }]),
    ]);
    expect(html).not.toContain("Luis Santos");
    expect(html).not.toContain("Tiempos por persona de Taller");
  });
});

describe("centrosConDesglose", () => {
  it("con tareas de la sección, solo la sección", () => {
    expect([...centrosConDesglose([of("1", "ot", []), of("1", "taller", [])], "ot")]).toEqual(["ot"]);
  });
  it("sin tareas de la sección, los centros que tienen trabajo", () => {
    expect([...centrosConDesglose([of("1", "taller", [])], "ot")]).toEqual(["taller"]);
  });
});
