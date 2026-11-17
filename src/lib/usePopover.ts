"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

// ─── Desplegables de la cabecera con `popover="auto"` (17/11/2026) ───────────
// Antes cada desplegable escuchaba `mousedown` en el documento para cerrarse al
// pinchar fuera y se apilaba en `capas-escape` para Escape. Con eso había que
// marcar los portales (`data-en-portal`) para que un diálogo abierto DESDE el
// desplegable no lo cerrara, y la marca era global: no distinguía el portal
// propio del de otro sitio.
//
// Ahora el panel es un popover nativo y el navegador hace todo eso:
//  · clic fuera y Escape lo cierran, y Escape cierra solo la capa de arriba;
//  · lo que cuelga de él EN EL DOM (el ConfirmDialog de "PIN olvidado") cuenta
//    como dentro: abrirlo o pulsar en él no cierra el desplegable;
//  · va a la capa superior: ningún `overflow` ni `z-index` lo tapa;
//  · al cerrarse con el foco dentro, el foco vuelve al botón.
//
// El botón lleva `popoverTarget={idPanel}` y NO un `onClick` que lo abra: si
// lo abriera el `onClick`, pinchar en el botón con el panel abierto lo
// cerraría por "clic fuera" y el `onClick` lo volvería a abrir. Con
// `popovertarget` el navegador sabe que ese botón es el suyo.
//
// Lo que NO hace todavía el navegador en Chrome/Edge es colgar el panel del
// botón (anchor positioning): eso sigue en JS, en `colocar`.

/** Cómo se cuelga el panel del ancla (`ref`, el envoltorio del botón). */
type Lado = "derecha" | "ancho";

/** Estado de un desplegable de la cabecera: `ref` va en el envoltorio del
 *  disparador (es el ancla) y `panelRef` + `idPanel` en el panel, que lleva
 *  `popover="auto"` y está SIEMPRE montado; lo de dentro se pinta solo con
 *  `open`. Compartido por la campana, Herramientas, el buscador y los avisos
 *  de Producción. */
export function usePopover<T extends HTMLElement = HTMLDivElement>(opciones?: {
  /** `derecha`: borde derecho con el del ancla (menús de la esquina).
   *  `ancho`: mismo ancho que el ancla (los resultados del buscador). */
  lado?: Lado;
  /** Hueco entre el ancla y el panel, en px. */
  separacion?: number;
}) {
  const lado = opciones?.lado ?? "derecha";
  const separacion = opciones?.separacion ?? 6;
  const [open, setOpen] = useState(false);
  const ref = useRef<T | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const idPanel = useId();
  // Lo que React cree que está abierto, para que el `beforetoggle` sepa si la
  // apertura la pidió él (y ya está pintando) o el navegador por su cuenta.
  const abiertoRef = useRef(false);
  // El navegador está a mitad de abrirlo (dentro de su `beforetoggle`): el
  // panel aún no es `:popover-open`, y volver a pedir `showPopover()` desde
  // el efecto lanza "Invalid to show a popover during another show operation".
  const abriendoRef = useRef(false);

  const colocar = useCallback(() => {
    const ancla = ref.current;
    const panel = panelRef.current;
    if (!ancla || !panel) return;
    const caja = ancla.getBoundingClientRect();
    // `inset` y `margin` del navegador centran el popover en la pantalla: aquí
    // se dan coordenadas explícitas, así que se anulan.
    panel.style.inset = "auto";
    panel.style.margin = "0";
    panel.style.top = `${caja.bottom + separacion}px`;
    if (lado === "ancho") {
      panel.style.left = `${caja.left}px`;
      panel.style.width = `${caja.width}px`;
    } else {
      // El ancho de la caja de `html`, que es la referencia de `position:
      // fixed`: `html` lleva `scrollbar-gutter: stable` y deja libre el hueco
      // de la barra aunque no haya barra. `innerWidth` y `clientWidth` lo
      // cuentan como sitio (medido: 1920 frente a 1910) y el panel salía 10 px
      // a la izquierda de su botón.
      const anchoVentana = document.documentElement.getBoundingClientRect().width;
      panel.style.right = `${anchoVentana - caja.right}px`;
    }
  }, [lado, separacion]);

  // React → navegador: `setOpen` abre o cierra el popover. En efecto de LAYOUT
  // para que el contenido y la apertura lleguen juntos a pantalla.
  useLayoutEffect(() => {
    abiertoRef.current = open;
    const panel = panelRef.current;
    if (!panel || abriendoRef.current) return;
    const visible = panel.matches(":popover-open");
    if (open && !visible) {
      colocar();
      panel.showPopover();
    } else if (!open && visible) {
      panel.hidePopover();
    }
  }, [open, colocar]);

  // Navegador → React: el botón con `popovertarget`, el clic fuera y Escape
  // abren o cierran sin pasar por `setOpen`.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    function antes(e: Event) {
      if ((e as ToggleEvent).newState === "closed") {
        // La marca, en el acto: si se vuelve a abrir antes del `toggle`, la
        // apertura tiene que ver que esto ya estaba cerrado. Pero `setOpen`
        // espera al `toggle` (abajo): llamado aquí, React desmontaba el
        // contenido —y con él lo que tenía el foco— antes de que el navegador
        // terminara de cerrar, y el foco caía en el `body` en vez de volver al
        // botón (medido el 17/11/2026 con el selector de DWG).
        abiertoRef.current = false;
        return;
      }
      if (abiertoRef.current) return; // la pidió `setOpen`, ya está pintando
      // Abre el navegador (el botón): se coloca y se pinta el contenido YA, en
      // síncrono, para que el panel no salga un fotograma vacío.
      colocar();
      abiertoRef.current = true;
      abriendoRef.current = true;
      try {
        flushSync(() => setOpen(true));
      } finally {
        abriendoRef.current = false;
      }
    }
    // Ya cerrado del todo (y el foco devuelto): ahora sí se vacía. Si entre
    // medias se reabrió, `abiertoRef` vuelve a estar a `true` y no se toca.
    function despues(e: Event) {
      if ((e as ToggleEvent).newState === "closed" && !abiertoRef.current) setOpen(false);
    }
    panel.addEventListener("beforetoggle", antes);
    panel.addEventListener("toggle", despues);
    return () => {
      panel.removeEventListener("beforetoggle", antes);
      panel.removeEventListener("toggle", despues);
    };
  }, [colocar]);

  // Abierto, sigue al ancla si la ventana cambia o algo se desplaza.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", colocar);
    window.addEventListener("scroll", colocar, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", colocar);
      window.removeEventListener("scroll", colocar, { capture: true });
    };
  }, [open, colocar]);

  // Cerrar desde React (la ✕, elegir un resultado) pasa primero por el
  // navegador: `hidePopover()` cierra con el contenido aún montado, devuelve
  // el foco al botón y el `toggle` vacía después. Con `setOpen(false)` a
  // secas, React desmontaba antes lo enfocado y el foco caía en el `body`.
  const pedir = useCallback((abrir: boolean) => {
    const panel = panelRef.current;
    if (!abrir && panel?.matches(":popover-open")) panel.hidePopover();
    else setOpen(abrir);
  }, []);

  return { open, setOpen: pedir, ref, panelRef, idPanel };
}
