"use client";

import { useEffect, useState } from "react";

/** Botón flotante para volver al principio cuando se ha bajado bastante.
 *  Escucha el scroll de la ventana; aparece pasados ~500 px. */
export function BotonArriba() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}
      aria-label="Volver arriba"
      title="Volver arriba"
      /* EN DORADO, no en cristal. Con `glass-panel-strong` era translúcido y
         flotaba sobre una lista que ya va llena de tarjetas con relieve: se
         camuflaba con el fondo justo cuando hace falta, que es con la página
         muy bajada. El dorado de marca es el mismo que lleva la pestaña activa
         de la cabecera, así que no es un color nuevo — y su tinta oscura se
         lee en los dos temas, que es por lo que ese par existe.
         `boton-arriba`: la veta y el relieve de toda la web (globals.css). */
      className="boton-arriba fixed bottom-16 right-4 z-40 flex items-center gap-1.5 rounded-full border border-brand-500 bg-brand-400 px-3 py-2 text-xs font-semibold text-brand-950 transition-[transform,box-shadow] focus-visible:outline-2 focus-visible:outline-focus"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="m6 15 6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Volver arriba
    </button>
  );
}
