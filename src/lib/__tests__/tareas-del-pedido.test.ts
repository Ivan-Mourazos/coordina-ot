import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { TareasDelPedido } from "../../components/HistorialTareas";

// ─── «Tareas y tiempos», ANTES de pedir los datos ────────────────────────────
// En la ficha de un pedido, "Documentos de RPS" y "Notas" son bloques con su
// caja, su borde y su fondo desde que se abre la ficha. "Tareas y tiempos"
// tenía que verse igual desde el principio y solo se convertía en un bloque
// DESPUÉS de cargar — antes de eso era un `chip-3d` suelto, que canta al lado
// de los otros dos. Esto comprueba la caja de ANTES de pulsar, que es la que
// se veía distinta.

test('el bloque de "Tareas y tiempos" se ve como tal ANTES de cargar los datos, no como un chip suelto', () => {
  const html = renderToStaticMarkup(
    createElement(TareasDelPedido, { pedido: "AR.26.03914", seccion: "ot" }),
  );
  // El MISMO relieve que "Documentos de RPS", "Notas" y las tarjetas de OF
  // (`bloque-3d`): lo que NO puede seguir siendo es un `chip-3d` suelto.
  expect(html).toContain("bloque-3d");
  expect(html).not.toContain("chip-3d");
  expect(html).toContain("Tareas y tiempos");
  // Sin el código del pedido: venía de cuando esto era una ventana suelta y
  // tenía que decir de qué pedido era. Dentro de la ficha lo repetía, porque
  // el código ya está en su cabecera.
  expect(html).not.toContain("AR.26.03914");
});

test('pulsarlo sigue siendo lo que pide los datos: el botón no está deshabilitado en reposo', () => {
  const html = renderToStaticMarkup(
    createElement(TareasDelPedido, { pedido: "AR.26.03914", seccion: "ot" }),
  );
  expect(html).not.toContain("disabled=\"\"");
});
