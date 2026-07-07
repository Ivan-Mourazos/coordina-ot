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
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Volver arriba"
      title="Volver arriba"
      className="glass-panel-strong fixed bottom-4 left-4 z-40 grid size-10 place-items-center rounded-full text-text-muted shadow-lg transition-colors hover:text-text"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="m6 15 6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
