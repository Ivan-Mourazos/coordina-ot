import { useEffect } from "react";

// ─── Congelar el fondo mientras hay algo abierto encima ──────────────────────
// Sin esto, la rueda del ratón sobre un panel abierto mueve la página de detrás:
// cierras y apareces en otro sitio de la lista, sin haber tocado nada. Pasaba en
// el Drawer del pedido, que ocupa la pantalla entera pero deja el `body` suelto.
//
// El contador va a nivel de MÓDULO y no por instancia a propósito: puede haber
// dos cosas abiertas a la vez (el "+N más" de una fase y el panel de un
// compañero son estados independientes, y con teclado se llega al segundo sin
// cerrar el primero). Si cada una guardara y restaurara su PROPIO
// `body.style.overflow`, la que se desmonta primero pisaría el estilo que puso
// la segunda —que sigue abierta—: el "hidden" se perdería mientras aún hace
// falta, o la última en cerrarse restauraría un valor capturado cuando el body
// YA estaba congelado, dejándolo congelado para siempre. El contador solo
// congela al pasar de 0→1 y solo restaura al volver a 0.

let bloqueos = 0;
let overflowOriginal = "";
let paddingOriginal = "";

function bloquear() {
  if (bloqueos === 0) {
    const { body } = document;
    overflowOriginal = body.style.overflow;
    paddingOriginal = body.style.paddingRight;
    // Compensa el ancho de la barra de scroll para que el fondo no dé un salto
    // lateral al congelarlo.
    const hueco = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (hueco > 0) body.style.paddingRight = `${hueco}px`;
  }
  bloqueos += 1;
}

function liberar() {
  bloqueos = Math.max(0, bloqueos - 1);
  if (bloqueos === 0) {
    document.body.style.overflow = overflowOriginal;
    document.body.style.paddingRight = paddingOriginal;
  }
}

/** Congela el scroll de la página mientras `activo`. */
export function useScrollBloqueado(activo: boolean): void {
  useEffect(() => {
    if (!activo) return;
    bloquear();
    return liberar;
  }, [activo]);
}
