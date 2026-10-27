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

test("los tiempos van todos a la derecha y con cifras de ancho fijo", () => {
  const html = renderToStaticMarkup(createElement(TareasDeOF, { of: OF }));
  // Un tiempo por tarea, en mono y con cifras de ancho fijo, para que se
  // recorran con la vista aunque midan "7m" y "1h 20m".
  expect(html.match(/tabular-nums/g)).toHaveLength(3);
  // En columnas solo con sitio (27/10/2026), y sin repetir el fallo de la
  // rejilla de antes: la columna del medio se quedaba con lo que pedía su
  // contenido y en la ficha, estrecha, la descripción salía a una palabra por
  // línea. Ahora la descripción se queda el hueco principal (1fr) y se
  // recorta, y quién lleva tope de ancho.
  expect(html).toContain("grid-cols-[minmax(0,1fr)_auto]");
  expect(html).toContain("min-w-0 truncate");
  expect(html).toContain("@[22rem]:max-w-[16rem]");
  expect(html).not.toContain("grid-cols-[minmax(0,1fr)_auto_56px]");
});

test("cada persona lleva su tiempo, también si es la única de la tarea", () => {
  const html = renderToStaticMarkup(createElement(TareasDeOF, { of: OF }));
  expect(html).toContain("Jaime Vázquez");
  expect(html).toContain("Jaime Vázquez 4m");
  // Con dos sí hace falta el de cada uno, que es lo que el total no dice.
  expect(html).toContain("Iván Sánchez 7m");
});

test("una OF sin tareas en RPS lo dice en el idioma de quien lo lee", () => {
  const vacia = { ...OF, tareas: [] } as unknown as HistorialOF;
  const html = renderToStaticMarkup(createElement(TareasDeOF, { of: vacia }));
  expect(html).toContain("Esta OF no tiene tareas en RPS.");
  expect(html).not.toContain("Sin desglose de tareas disponible");
});

test("en la lista, el botón no repite el código del pedido: no cabe y ya está en la fila", () => {
  // En el Historial este botón vive en una columna de 64 px que no crece con
  // el contenido, y el código ya se lee tres columnas a la izquierda.
  const enLista = renderToStaticMarkup(
    createElement(HistorialTareas, {
      pedido: "AR.26.03914", ofs: [OF], seccion: "ot" as const, compacto: true,
    }),
  );
  expect(enLista).toContain("Tareas");
  expect(enLista).not.toContain("AR.26.03914");

  // Y en la ficha tampoco: el código ya está en la cabecera de la ficha, y
  // repetido a la derecha del bloque solo ocupaba sitio.
  const enFicha = renderToStaticMarkup(
    createElement(HistorialTareas, { pedido: "AR.26.03914", ofs: [OF], seccion: "ot" as const }),
  );
  expect(enFicha).not.toContain("AR.26.03914");
});
