"use client";

import { useEffect, useRef, useState } from "react";

/** Botón "Ver reserva (N)" que abre un mini panel con el material reservado
 *  y su cantidad. Si no hay reservas, muestra un estado gris discreto. */
export function ReservaChip({
  n,
  detalle,
}: {
  n: number;
  detalle?: string[];
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!abierto) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [abierto]);

  if (n === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-text-muted/70">
        🧵 Sin reservas de material
      </span>
    );
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="chip-3d inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-teal-700 dark:text-teal-300"
      >
        🧵 Ver reserva
        <span className="rounded-full bg-teal-600 px-1.5 text-[10px] font-bold text-white">
          {n}
        </span>
      </button>

      {abierto && (
        <div className="glass-pop absolute left-0 top-full z-30 mt-1.5 w-72 rounded-xl p-2.5" style={{ background: "var(--surface)" }}>
          <p className="mb-1.5 flex items-center gap-1.5 border-b border-[var(--glass-border)] pb-1.5 text-[10px] font-bold uppercase tracking-wide text-teal-700 dark:text-teal-300">
            🧵 Material reservado ({n})
          </p>
          <ul className="space-y-1">
            {detalle?.map((m) => {
              const i = m.lastIndexOf(" · ");
              const nombre = i >= 0 ? m.slice(0, i) : m;
              const cant = i >= 0 ? m.slice(i + 3) : null;
              return (
                <li key={m} className="flex items-start justify-between gap-2 text-[11px]">
                  <span className="text-text">{nombre}</span>
                  {cant && (
                    <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono font-semibold text-text ring-1 ring-border">
                      {cant}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
