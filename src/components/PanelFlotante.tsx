"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Contenedor común de los desplegables del tablero (el «+N más» de una fase y
 *  el panel de un compañero).
 *
 *  Existe para que los dos se comporten igual: mismo sitio, mismo fondo, misma
 *  forma de cerrarse. Antes eran dos implementaciones distintas y se notaba.
 *
 *  Flota en vez de empujar: si creciera el bloque de arriba, la página daría un
 *  salto y se perdería el alto que el rediseño acaba de ganar. Y mientras está
 *  abierto se congela el scroll del fondo, porque si no la rueda mueve la
 *  bandeja de detrás y al cerrar apareces en otro sitio. */
export function PanelFlotante({
  onCerrar,
  ancho = "32rem",
  children,
}: {
  onCerrar: () => void;
  /** Ancho máximo. El panel de compañero necesita más: lleva columnas. */
  ancho?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onCerrar();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onCerrar]);

  useEffect(() => {
    const { body } = document;
    const overflowPrevio = body.style.overflow;
    const paddingPrevio = body.style.paddingRight;
    // Compensa el ancho de la barra de scroll para que el fondo no dé un salto
    // lateral al congelarlo.
    const hueco = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (hueco > 0) body.style.paddingRight = `${hueco}px`;
    return () => {
      body.style.overflow = overflowPrevio;
      body.style.paddingRight = paddingPrevio;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center pt-24">
      {/* Fondo suave: separa el panel sin apagar el tablero, que sigue siendo
          contexto útil mientras decides. */}
      <div onClick={onCerrar} aria-hidden className="absolute inset-0 bg-black/15" />
      <div
        ref={ref}
        style={{ background: "var(--surface)", width: `min(${ancho}, 92vw)` }}
        className="glass-pop scroll-thin relative max-h-[60vh] overflow-y-auto rounded-xl p-3"
      >
        {children}
      </div>
    </div>
  );
}
