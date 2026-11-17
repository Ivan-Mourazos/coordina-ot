"use client";

import { useState } from "react";
import { COLORES_ELEGIBLES } from "@/lib/color-persona";
import { cambiarMiColor } from "@/lib/useColoresPersona";
import { tintaSobre } from "@/lib/tinta";

// ─── Elegir el color de tu cara ──────────────────────────────────────────────
// Una fila de muestras en el menú de la cuenta (OT y Producción). Se guarda en
// tu cuenta, así que te sigue a cualquier ordenador y lo ven los demás. «De
// siempre» vuelve al color que tenías antes de elegir.

export function ElegirColor({ miId, actual }: { miId: string; actual: string }) {
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState(false);

  const elegir = async (color: string | null) => {
    setGuardando(true);
    setFallo(false);
    const ok = await cambiarMiColor(miId, color);
    setGuardando(false);
    if (!ok) setFallo(true);
  };

  return (
    <div className="mt-2 border-t border-border px-2 pt-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Tu color</span>
        <button
          type="button"
          disabled={guardando}
          onClick={() => void elegir(null)}
          title="Volver al color que tenías antes de elegir"
          className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-text-muted hover:bg-surface-2 hover:text-text disabled:opacity-50"
        >
          De siempre
        </button>
      </div>
      <div role="radiogroup" aria-label="Tu color" className="flex flex-wrap gap-1.5">
        {COLORES_ELEGIBLES.map((c) => {
          const elegido = c.toLowerCase() === actual.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={elegido}
              aria-label={`Color ${c}`}
              disabled={guardando}
              onClick={() => void elegir(c)}
              className={`grid size-6 place-items-center rounded-full text-[10px] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60 ${
                elegido ? "ring-2 ring-text ring-offset-2 ring-offset-surface" : ""
              }`}
              style={{ background: c, color: tintaSobre(c) }}
            >
              {elegido && "✓"}
            </button>
          );
        })}
      </div>
      {fallo && <p className="mt-1 text-[10px] text-red-600 dark:text-red-400">No se pudo guardar. Prueba otra vez.</p>}
    </div>
  );
}
