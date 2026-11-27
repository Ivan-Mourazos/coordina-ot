"use client";

import type { ReactNode } from "react";

/** Una fila que se marca entera: la casilla y su texto en una tarjeta que se
 *  pinta al elegirla. Para listas de «elige cuáles» (Iván, 27/11/2026: las
 *  casillas sueltas del navegador se veían pobres). La casilla de verdad sigue
 *  ahí, oculta: teclado, lector de pantalla y `form` funcionan igual. */
export function CasillaFila({
  marcada,
  desactivada = false,
  onCambiar,
  children,
}: {
  marcada: boolean;
  desactivada?: boolean;
  onCambiar: (marcada: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 rounded-[14px] px-3 py-2 text-xs transition-colors motion-reduce:transition-none ${
        desactivada
          ? "cursor-not-allowed text-text-muted"
          : marcada
            ? "cursor-pointer bg-surface text-text shadow-[var(--hero-sombra-campo)] ring-[1.5px] ring-inset ring-brand-400"
            : "cursor-pointer text-text hover:bg-[var(--hero-relleno-encima)]"
      }`}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={marcada}
        disabled={desactivada}
        onChange={(e) => onCambiar(e.target.checked)}
      />
      <span
        aria-hidden
        className={`mt-px grid size-[18px] shrink-0 place-items-center rounded-[6px] transition-colors motion-reduce:transition-none peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--hero-anillo)] ${
          marcada
            ? "bg-brand-400 text-brand-950"
            : desactivada
              ? "bg-[var(--hero-relleno-encima)]"
              : "bg-surface ring-1 ring-inset ring-border"
        }`}
      >
        {marcada && (
          <svg viewBox="0 0 16 16" className="size-3">
            <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}
