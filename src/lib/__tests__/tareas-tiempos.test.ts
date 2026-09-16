import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { HistorialTareas, TareasDeOF } from "../../components/HistorialTareas";
import type { HistorialOF } from "../historial";

const OF: HistorialOF = {
  codigo: "0231922", descripcion: "Lona frontal", centro: "ot",
  tiempoImputadoMin: 14, piezas: 1,
  tareas: [
    { codigo: "1", descripcion: "Plantear", tiempoImputadoMin: 10,
      personas: [{ nombre: "Iván Sánchez", min: 7 }, { nombre: "Jaime Vázquez", min: 3 }] },
    { codigo: "2", descripcion: "Preparar archivo", tiempoImputadoMin: 4,
      personas: [{ nombre: "Jaime Vázquez", min: 4 }] },
    { codigo: "9", descripcion: "Embalar", tiempoImputadoMin: 0, personas: [] },
  ],
} as unknown as HistorialOF;

test("ya no hay popover: el desglose se abre dentro, como los demás bloques", () => {
  const html = renderToStaticMarkup(
    createElement(HistorialTareas, { pedido: "AR.26.03914", ofs: [OF], seccion: "ot" as const }),
  );
  expect(html).not.toContain("popover");
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain("Tareas y tiempos");
});

test("abierto de salida cuando se pide, para no cobrar un segundo clic", () => {
  const html = renderToStaticMarkup(
    createElement(HistorialTareas, {
      pedido: "AR.26.03914", ofs: [OF], seccion: "ot" as const, abrirAlMontar: true,
    }),
  );
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain("Plantear");
});

test("los tiempos van todos en la misma columna y con cifras de ancho fijo", () => {
  const html = renderToStaticMarkup(createElement(TareasDeOF, { of: OF }));
  // Una tarea = una rejilla de tres columnas: tarea, quién, tiempo.
  expect(html.match(/grid-cols-\[minmax\(0,1fr\)_auto_56px\]/g)).toHaveLength(3);
  expect(html.match(/tabular-nums/g)).toHaveLength(3);
});

test("con una sola persona su nombre basta: su tiempo es el de la tarea", () => {
  const html = renderToStaticMarkup(createElement(TareasDeOF, { of: OF }));
  expect(html).toContain("Jaime Vázquez");
  expect(html).not.toContain("Jaime Vázquez 4m");
  // Con dos sí hace falta el de cada uno, que es lo que el total no dice.
  expect(html).toContain("Iván Sánchez 7m");
});

test("una OF sin tareas en RPS lo dice en el idioma de quien lo lee", () => {
  const vacia = { ...OF, tareas: [] } as unknown as HistorialOF;
  const html = renderToStaticMarkup(createElement(TareasDeOF, { of: vacia }));
  expect(html).toContain("Esta OF no tiene tareas en RPS.");
  expect(html).not.toContain("Sin desglose de tareas disponible");
});
