"use client";

import { useLayoutEffect, useRef } from "react";

/** Fundido breve al cambiar de pestaña, como el de Planteamientos (Iván,
 *  26/10/2026: «que vaya así de fluido», mirando HeroUI).
 *
 *  Anima los hijos de la zona cuando cambia `clave`, sin desmontar nada que no
 *  se desmontara ya. La cabecera y las tiras quedan fuera: la píldora de las
 *  pestañas se desliza por su cuenta, y si la cabecera también se moviera
 *  parecería que salta la página entera. Las capas fijas (avisos, ventanas)
 *  tampoco: no son la pestaña, y moverlas las haría temblar. */
export function useContenidoFluido<T extends HTMLElement = HTMLDivElement>(clave: string) {
  const ref = useRef<T>(null);
  const anterior = useRef(clave);
  useLayoutEffect(() => {
    const cambio = anterior.current !== clave;
    anterior.current = clave;
    const zona = ref.current;
    // Marca la zona para que el clic en una pestaña (pestanasFluidas.ts) funda
    // solo lo que cambia. Si el cambio llega por ahí, la View Transition ya lo
    // anima y aquí no se repite; esto queda para los cambios que no son un clic
    // en la tira (un enlace, el buscador, la URL).
    zona?.setAttribute("data-fluido", "");
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!cambio || !zona || document.documentElement.dataset.transicionPestana || reducir.matches) return;
    const animaciones = Array.from(zona.children)
      .filter(
        (hijo): hijo is HTMLElement =>
          hijo instanceof HTMLElement &&
          !hijo.matches(".tira-3d, header, [hidden]") &&
          hijo.getClientRects().length > 0 &&
          getComputedStyle(hijo).position !== "fixed",
      )
      .map((hijo) =>
        hijo.animate?.(
          [
            { opacity: 0.35, transform: "translateY(5px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 200, easing: "cubic-bezier(.2,.8,.2,1)" },
        ),
      );
    const cancelar = () => animaciones.forEach((a) => a?.cancel());
    reducir.addEventListener("change", cancelar);
    return () => {
      cancelar();
      reducir.removeEventListener("change", cancelar);
    };
  }, [clave]);
  return ref;
}
