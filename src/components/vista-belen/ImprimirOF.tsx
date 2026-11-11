"use client";

import { useState } from "react";

// ─── Imprimir la OF (hoja de ruta) y la reserva (vale de material) ──────────
// Belén, 11/11/2026: «separa imprimir OF y reserva, cada uno con una casilla:
// hay muchos pedidos que no llevan reserva». En una OF imprime esa OF; en la
// cabecera del pedido, todas las abiertas. Sin nada reservado, la casilla de
// la reserva sale apagada (y la página de imprimir se salta los vales vacíos).

const CASILLA =
  "inline-flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--hero-anillo)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50";

export function ImprimirOF({
  ofs,
  conReserva,
  etiqueta = "Imprimir",
}: {
  ofs: readonly string[];
  /** ¿Hay algo reservado? undefined = todavía no se sabe (se deja marcar). */
  conReserva: boolean | undefined;
  etiqueta?: string;
}) {
  const [ruta, setRuta] = useState(true);
  const [vale, setVale] = useState(true);
  const valeActivo = vale && conReserva !== false;
  const que = ruta && valeActivo ? "todo" : ruta ? "ruta" : valeActivo ? "vale" : null;
  const href = que ? `/vista-belen/imprimir?ofs=${encodeURIComponent(ofs.join(","))}&que=${que}` : undefined;

  return (
    <div role="group" aria-label={etiqueta} className="inline-flex items-center gap-1 rounded-full bg-[var(--hero-relleno)] p-1">
      <label className={`${CASILLA} ${ruta ? "bg-surface text-text shadow-[var(--hero-sombra-campo)]" : "text-text-muted"}`} title="La hoja de ruta: la OF con sus operaciones y códigos de barras">
        <input type="checkbox" checked={ruta} onChange={(e) => setRuta(e.target.checked)} className="size-3.5 accent-[var(--color-brand-500)]" />
        OF
      </label>
      <label
        className={`${CASILLA} ${valeActivo ? "bg-surface text-text shadow-[var(--hero-sombra-campo)]" : "text-text-muted"}`}
        title={conReserva === false ? "Sin material reservado: no hay vale que imprimir" : "El vale de material: lo reservado con sus códigos de barras"}
      >
        <input
          type="checkbox"
          checked={valeActivo}
          disabled={conReserva === false}
          onChange={(e) => setVale(e.target.checked)}
          className="size-3.5 accent-[var(--color-brand-500)]"
        />
        Reserva
      </label>
      <a
        href={href}
        aria-disabled={!href}
        target="_blank"
        rel="noopener"
        onClick={(e) => { if (!href) e.preventDefault(); }}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold transition-[transform,background-color] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-anillo)] motion-reduce:transition-none ${
          href ? "bg-brand-400 text-brand-950 active:scale-[.97]" : "cursor-not-allowed text-text-muted"
        }`}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <path d="M6 14h12v7H6z" />
        </svg>
        {etiqueta}
      </a>
    </div>
  );
}
