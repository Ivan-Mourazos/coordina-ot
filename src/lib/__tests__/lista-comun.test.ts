import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { BloqueLista } from "../../components/BloqueLista";
import { FilaDesplegable } from "../../components/FilaDesplegable";

const COLUMNAS = "grid grid-cols-[28px_136px_minmax(0,1fr)] items-center gap-x-3";

function fila(abierta: boolean) {
  return renderToStaticMarkup(
    createElement(FilaDesplegable, {
      columnas: COLUMNAS,
      abierta,
      onAlternar() {},
      etiqueta: "AR.26.03914",
      idDetalle: "detalle-1",
      celdas: createElement("span", null, "MAHOU"),
      detalle: createElement("p", null, "el detalle"),
    }),
  );
}

test("la fila cerrada no pinta su detalle, y dice que está plegada", () => {
  const html = fila(false);
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain("Desplegar AR.26.03914");
  expect(html).not.toContain("el detalle");
});

test("la fila abierta pinta el detalle y se marca con el acento de marca", () => {
  const html = fila(true);
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain("Plegar AR.26.03914");
  expect(html).toContain("el detalle");
  // La barra dorada a la izquierda y el fondo: es lo que dice dónde empieza y
  // dónde acaba lo desplegado cuando hay tres abiertos a la vez.
  expect(html).toContain("bg-brand-500");
  expect(html).toContain("bg-brand-500/10");
});

test("el botón que cubre la fila apunta al detalle, para el lector de pantalla", () => {
  expect(fila(false)).toContain('aria-controls="detalle-1"');
});

test("la fila puede contar algo al posar el ratón, sin que sea obligatorio", () => {
  const con = renderToStaticMarkup(
    createElement(FilaDesplegable, {
      columnas: COLUMNAS, abierta: false, onAlternar() {}, etiqueta: "AR.26.03914",
      idDetalle: "detalle-1", titulo: "Lo pasó Iván el 04/09",
      celdas: createElement("span", null, "MAHOU"), detalle: createElement("p", null, "x"),
    }),
  );
  expect(con).toContain("Lo pasó Iván el 04/09");
  expect(fila(false)).not.toContain("title=");
});

test("la cabecera de columnas lleva la rejilla que se le pasa, para que cada rótulo caiga sobre su columna", () => {
  const html = renderToStaticMarkup(
    createElement(BloqueLista, {
      columnas: COLUMNAS,
      cabecera: [
        createElement("span", { key: "a" }),
        createElement("span", { key: "b" }, "Pedido"),
        createElement("span", { key: "c" }, "Cliente"),
      ],
      children: createElement("div", null, "una fila"),
    }),
  );
  // Una sola vez: la rejilla de las FILAS la pone quien las pinta, que recibe
  // la misma clase. Aquí solo se reparte a la cabecera.
  expect(html.match(/grid-cols-\[28px_136px_minmax\(0,1fr\)\]/g)).toHaveLength(1);
  expect(html).toContain("bloque-3d");
  expect(html).toContain("Pedido");
  expect(html).toContain("una fila");
});

test("el bloque que envuelve las filas NO es una rejilla: si lo fuera, dos filas saldrían una al lado de otra", () => {
  const html = renderToStaticMarkup(
    createElement(BloqueLista, {
      columnas: COLUMNAS,
      children: [
        createElement("div", { key: "a" }, "fila A"),
        createElement("div", { key: "b" }, "fila B"),
      ],
    }),
  );
  // El contenedor `bloque-3d` va con las clases justas. Ponerle `grid` haría
  // que el reparto automático de CSS Grid metiera cada fila en una celda de la
  // misma línea, en vez de una debajo de otra.
  expect(html).toContain('class="bloque-3d overflow-hidden rounded-xl"');
  expect(html).toContain("fila A");
  expect(html).toContain("fila B");
});

test("el rótulo va FUERA del bloque, que es lo que separa un bloque del siguiente", () => {
  const html = renderToStaticMarkup(
    createElement(BloqueLista, {
      columnas: COLUMNAS,
      rotulo: { texto: "Por revisar", claseDot: "bg-amber-500", sufijo: "3 OF" },
      children: createElement("div", null, "una fila"),
    }),
  );
  expect(html.indexOf("Por revisar")).toBeLessThan(html.indexOf("bloque-3d"));
  expect(html).toContain("bg-amber-500");
  expect(html).toContain("3 OF");
});

test("sin cabecera ni rótulo el bloque no deja huecos vacíos por encima", () => {
  const html = renderToStaticMarkup(
    createElement(BloqueLista, { columnas: COLUMNAS, children: createElement("div", null, "x") }),
  );
  expect(html.startsWith("<div")).toBe(true);
  expect(html).not.toContain("text-[11px] font-semibold text-text-muted");
});
