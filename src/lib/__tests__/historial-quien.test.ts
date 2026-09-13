import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Quien } from "../../components/HistorialQuien";
import type { HistorialItem } from "../historial";

// La columna «Quién» enseñaba DOS nombres y un "+N", cupieran o no. En una
// pantalla ancha sobraba sitio y seguía diciendo "+3"; en una estrecha, los dos
// nombres ya no cabían. Ahora se pintan todos y es la medida de la columna la
// que decide cuántos se quedan, así que lo que sale de aquí los lleva todos.

const item = (personas: string[]): HistorialItem =>
  ({
    pedido: "AR.26.04474",
    personas: personas.map((nombre, i) => ({ nombre, min: 60 - i })),
  }) as unknown as HistorialItem;

test("no corta por la regla de dos: salen todos los nombres", () => {
  const html = renderToStaticMarkup(
    createElement(Quien, { item: item(["Iván Sánchez", "Jaime Vázquez", "Adrián Quinteiro", "Tamara Villar"]) }),
  );
  expect(html).toContain("Iván Sánchez");
  expect(html).toContain("Jaime Vázquez");
  expect(html).toContain("Adrián Quinteiro");
  expect(html).toContain("Tamara Villar");
});

test("sin medir todavía no se inventa un «+N»", () => {
  // Antes de que el navegador mida la columna no se sabe cuántos sobran, y un
  // contador puesto a ojo saldría mal la primera vez que se pinta.
  const html = renderToStaticMarkup(
    createElement(Quien, { item: item(["Iván Sánchez", "Jaime Vázquez", "Adrián Quinteiro"]) }),
  );
  expect(html).not.toContain("+1");
  expect(html).not.toContain("+2");
});

test("el aviso de otro centro sigue delante de los nombres", () => {
  const conCentro = { ...item(["Silvia López"]), otrosCentros: ["taller"] } as HistorialItem;
  // Sin los `title`: ahí la lista completa va delante y no dice nada del orden
  // en que se ve.
  const html = renderToStaticMarkup(createElement(Quien, { item: conCentro })).replace(/title="[^"]*"/g, "");
  expect(html.indexOf("Taller")).toBeLessThan(html.indexOf("Silvia López"));
});
