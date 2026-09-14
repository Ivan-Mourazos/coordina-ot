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

// El mismo principio, un paso más: cuando el desglose no reparte nada, su
// número es el del centro escrito otra vez. En AR.26.04474 salía «Taller 47m»,
// «Esteban Mosteiro 47m» y «0232080 … 47m»: el mismo minuto tres veces, uno
// debajo de otro.
//
// Manda el del CENTRO y no el más pequeño: es el único que se sigue viendo con
// la sección plegada, y el que deja comparar OT, Diseño y Taller de un vistazo.
describe("el tiempo no se repite por los tres niveles", () => {
  it("con una persona y una OF, el tiempo solo sale en la cabecera del centro", () => {
    const html = pinta([of("0232080", "taller", [{ nombre: "Esteban Mosteiro", min: 47 }])]);
    expect(veces(html, "47m")).toBe(1);
    // El nombre y el código se quedan: eso el total no lo dice.
    expect(html).toContain("Esteban Mosteiro");
    expect(html).toContain("0232080");
  });

  it("con dos personas, cada una lleva el suyo: ahí sí reparten", () => {
    const html = pinta([
      of("0232080", "taller", [
        { nombre: "Esteban Mosteiro", min: 30 },
        { nombre: "Silvia López", min: 17 },
      ]),
    ]);
    expect(veces(html, "47m")).toBe(1); // el del centro
    expect(html).toContain("30m");
    expect(html).toContain("17m");
  });

  it("con dos OF, cada una lleva el suyo", () => {
    const html = pinta([
      of("0232080", "taller", [{ nombre: "Esteban Mosteiro", min: 30 }]),
      of("0232081", "taller", [{ nombre: "Esteban Mosteiro", min: 17 }]),
    ]);
    expect(html).toContain("30m");
    expect(html).toContain("17m");
  });
});
