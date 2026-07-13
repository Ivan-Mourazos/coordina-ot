"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const W = 288; // w-72

/** Popover del detalle de reserva, en un portal a document.body y
 *  posicionado en `fixed`: así nunca lo recorta un ancestro con
 *  overflow-hidden/auto (listas, drawer con scroll, etc.). */
function ReservaPopover({
  n,
  detalle,
  anchor,
  onClose,
}: {
  n: number;
  detalle?: string[];
  anchor: DOMRect;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.min(Math.max(margin, anchor.left), vw - W - margin);
  const top =
    anchor.bottom + 6 + 200 <= vh ? anchor.bottom + 6 : Math.max(margin, anchor.top - 6 - 200);

  return createPortal(
    <div
      ref={ref}
      className="glass-pop fixed z-[70] w-72 rounded-xl p-2.5"
      style={{ left, top, background: "var(--surface)" }}
    >
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
    </div>,
    document.body,
  );
}

/** Botón "Ver reserva (N)" que abre un mini panel con el material reservado
 *  y su cantidad. Si no hay reservas, muestra un estado gris discreto. */
export function ReservaChip({
  n,
  detalle,
}: {
  n: number;
  detalle?: string[];
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  if (n === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-text-muted/70">
        🧵 Sin reservas de material
      </span>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation();
          setAnchor((v) => (v ? null : btnRef.current?.getBoundingClientRect() ?? null));
        }}
        aria-expanded={anchor !== null}
        className="chip-3d inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-teal-700 dark:text-teal-300"
      >
        🧵 Ver reserva
        <span className="rounded-full bg-teal-600 px-1.5 text-[10px] font-bold text-white">
          {n}
        </span>
      </button>

      {anchor && (
        <ReservaPopover n={n} detalle={detalle} anchor={anchor} onClose={() => setAnchor(null)} />
      )}
    </>
  );
}
