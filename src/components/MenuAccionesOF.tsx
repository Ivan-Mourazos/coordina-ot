"use client";

import { usePopover } from "@/lib/usePopover";
import type { AccionDef } from "@/lib/acciones";

// ─── El cajón de "⋯" de una OF ───────────────────────────────────────────────
// La fila de acciones llegaba a cinco botones (el revisor revisando: reloj,
// Aprobar, Devolver, Dejar sin revisar, Anular) y se partía en dos líneas: la
// altura de cada OF bailaba según su estado, y "Anular OF" se quedaba flotando
// solo a la derecha en la segunda, como si fuera de otra cosa.
//
// Fuera se queda lo de todos los días —el reloj y el paso siguiente del
// flujo—; aquí dentro, lo que se usa de higos a brevas. No es esconderlo: es
// que un botón que se pulsa una vez al mes no puede competir por el sitio con
// uno que se pulsa veinte veces al día.

export function MenuAccionesOF({
  acciones,
  onElegir,
  etiqueta,
}: {
  acciones: readonly AccionDef[];
  onElegir: (a: AccionDef) => void;
  /** Cómo se llama cada una en ESTA OF ("Aprobar → Jaime"). */
  etiqueta: (a: AccionDef) => string;
}) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  if (acciones.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Más acciones"
        aria-expanded={open}
        title="Más acciones para esta OF"
        className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text-muted hover:border-border-strong hover:text-text"
      >
        ⋯
      </button>

      {open && (
        // A la DERECHA y hacia abajo: la fila de acciones cae al final de la
        // ficha de la OF, así que un menú anclado a la izquierda se salía del
        // panel por el lado que no tiene sitio.
        <div className="glass-pop absolute right-0 top-full z-40 mt-1.5 w-56 rounded-xl p-1">
          {acciones.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setOpen(false);
                onElegir(a);
              }}
              className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold hover:bg-[var(--glass-highlight)] ${
                a.tono === "peligro"
                  ? "text-red-600 dark:text-red-400"
                  : "text-text"
              }`}
            >
              {etiqueta(a)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
