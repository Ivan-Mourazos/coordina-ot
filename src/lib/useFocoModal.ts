"use client";

import { useEffect, useRef } from "react";

/** Qué cuenta como parada del tabulador dentro del diálogo. El `iframe` del
 *  PDF entra a propósito: es parte del contenido del drawer y sin él no se
 *  puede llegar al visor con el teclado. */
const FOCUSABLES = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Foco de un diálogo modal: entra al abrir, no se escapa mientras está
 *  abierto y vuelve donde estaba al cerrar.
 *
 *  Sin esto el foco se queda detrás del telón: se abre el drawer de un pedido
 *  y el tabulador sigue recorriendo el tablero que hay debajo —invisible bajo
 *  el desenfoque—, así que no hay forma de saber dónde está el cursor ni de
 *  llegar a los botones del propio drawer.
 *
 *  El elemento que recibe el foco al abrir es el marcado con
 *  `data-foco-inicial` (normalmente la ✕, que es la salida); si no hay
 *  ninguno, el primero que se pueda enfocar. El mismo criterio que usa
 *  ConfirmDialog, que ya lo hacía a mano para sus dos botones.
 *
 *  Devuelve la ref que hay que poner en el contenedor del diálogo — el de
 *  fuera, el que cubre la pantalla: en los drawers el PDF de la izquierda y
 *  el panel de la derecha son hermanos, y atrapar el foco solo en el panel
 *  dejaría el visor inalcanzable. */
export function useFocoModal<T extends HTMLElement>(activo: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!activo) return;
    const previo = document.activeElement as HTMLElement | null;
    const panel = ref.current;

    const paradas = () =>
      [...(panel?.querySelectorAll<HTMLElement>(FOCUSABLES) ?? [])].filter(
        // `offsetParent` null = oculto (display:none o un padre colapsado);
        // enfocar ahí deja el foco en la nada.
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    const inicial =
      panel?.querySelector<HTMLElement>("[data-foco-inicial]") ?? paradas()[0] ?? null;
    inicial?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab" || !panel) return;
      const items = paradas();
      if (items.length === 0) return;
      const primero = items[0];
      const ultimo = items[items.length - 1];

      if (!panel.contains(document.activeElement)) {
        // El foco se había ido fuera (o lo tenía el body): se recupera.
        e.preventDefault();
        primero.focus();
      } else if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Al cerrar, de vuelta a lo que abrió el diálogo (la tarjeta o la fila),
      // no al principio de la página.
      //
      // LÍMITE CONOCIDO, y por eso se comprueba en vez de llamar a secas: hay
      // disparadores que no sobreviven a su propio clic. El ejemplo es el
      // ConfirmDialog abierto desde una opción del menú "⋯": al ejecutarse la
      // acción el menú se desmonta, así que al cerrar el diálogo `previo` es un
      // nodo suelto, fuera del documento, y enfocarlo no hace absolutamente
      // nada —el foco se queda en el `body`—. Aquí no se puede arreglar: no
      // hay forma de adivinar a dónde debería volver.
      //
      // La solución sería que `usePopover` devolviese el foco a su propio
      // botón al cerrarse. No se ha hecho todavía porque lo usan seis
      // componentes (entre ellos el buscador, que al elegir un resultado abre
      // el Drawer) y dos restauraciones de foco compitiendo no tienen un orden
      // garantizado: hay que hacerlo con calma y mirándolo.
      if (previo && document.contains(previo)) previo.focus?.();
    };
  }, [activo]);

  return ref;
}
