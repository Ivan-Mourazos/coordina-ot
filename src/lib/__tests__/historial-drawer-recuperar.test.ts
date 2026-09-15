import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { RecuperarPedido } from "../../components/RecuperarPedido";
import { OPERARIOS } from "../mock";

const noop = () => {};

// NOTA: el brief de la Task 8 pedía este test montando `HistorialDrawer`
// entero (como hace `drawer-pasar.test.ts` con `Drawer`). Pero
// `HistorialDrawer` pide su `detalle` con `fetch` dentro de un `useEffect`
// (Task 6/7): en `renderToStaticMarkup` los efectos no se ejecutan nunca —ni
// aquí ni en ningún sitio del proyecto, no hay jsdom ni testing-library
// instalados—, así que `detalle` se queda en `null` y el bloque entero de
// "Lo único que se puede HACER" (donde iría este botón) no llega a pintarse.
// Comprobado: con el componente ya montado, ese test seguía dando el HTML
// vacío de la ficha. `Drawer` (el del tablero) no tiene este problema porque
// recibe el pedido YA CARGADO como prop, sin fetch propio.
//
// Se prueba en su lugar el componente que de verdad produce esta tarea,
// `RecuperarPedido`, igual que `historial-ficha-personas.test.ts` prueba
// `HistorialCentros` en vez de `HistorialDrawer`: el botón que abre la
// confirmación se pinta sin depender de ningún fetch.
test("el botón de volver a plantear sale en la ficha del Historial", () => {
  const html = renderToStaticMarkup(
    createElement(RecuperarPedido, {
      pedido: "AR.26.04351",
      seccion: "ot",
      miId: "ivan",
      operarios: OPERARIOS,
      onRecuperado: noop,
    }),
  );
  expect(html).toContain("Volver a plantear el pedido");
});
