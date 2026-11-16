"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SECCIONES_MENCIONABLES, claveDestino, type Destino } from "@/lib/nota-pedido";
import type { PersonaPublica } from "@/lib/personas";

// ─── Para quién es una nota (16/11/2026) ────────────────────────────────────
// Vacío = para todos, el caso normal. Al marcar algo, la nota solo la ven esas
// personas y secciones (y quien la escribe). Ver docs/NOTAS-MENCIONES.md.

/** El nombre de hoy de un destino; una persona que ya no está sale «alguien». */
export function nombreDestino(d: Destino, personas: readonly PersonaPublica[]): string {
  if (d.tipo === "seccion") return SECCIONES_MENCIONABLES.find((s) => s.id === d.id)?.nombre ?? d.id;
  return personas.find((p) => p.id === d.id)?.nombre ?? "alguien";
}

export function SelectorPara({
  para,
  onPara,
  personas,
  miId,
  disabled,
}: {
  para: Destino[];
  onPara: (p: Destino[]) => void;
  personas: readonly PersonaPublica[];
  miId: string | null;
  disabled: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const idPanel = useId();

  // Se cierra al pinchar fuera o con Escape (sin cerrar la ficha).
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const marcadas = new Set(para.map(claveDestino));
  const alternar = (d: Destino) => {
    const k = claveDestino(d);
    onPara(marcadas.has(k) ? para.filter((x) => claveDestino(x) !== k) : [...para, d]);
  };

  const opciones: { destino: Destino; nombre: string }[] = [
    ...SECCIONES_MENCIONABLES.map((s) => ({ destino: { tipo: "seccion", id: s.id } as Destino, nombre: s.nombre })),
    ...personas
      .filter((p) => p.id !== miId)
      .map((p) => ({ destino: { tipo: "persona", id: p.id } as Destino, nombre: p.nombre })),
  ];

  return (
    <div
      ref={caja}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && abierto) {
          e.stopPropagation();
          setAbierto(false);
          // El foco vuelve al botón: si se queda en el aire, el siguiente
          // Escape cerraría la ficha entera.
          boton.current?.focus();
        }
      }}
      // Tabular fuera también lo cierra.
      onBlur={(e) => {
        if (abierto && !caja.current?.contains(e.relatedTarget as Node | null)) setAbierto(false);
      }}
    >
      <button
        ref={boton}
        type="button"
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        onClick={() => setAbierto((v) => !v)}
        className="rounded-full bg-[var(--hero-relleno)] px-2.5 py-1 text-[11px] font-semibold text-text hover:bg-[var(--hero-relleno-encima)] disabled:opacity-50"
      >
        Para: {para.length === 0 ? "Todos" : `${para.length} elegido${para.length === 1 ? "" : "s"}`} <span aria-hidden>▾</span>
      </button>
      {abierto && (
        <div
          id={idPanel}
          role="group"
          aria-label="Para quién es la nota"
          className="absolute right-0 top-full z-30 mt-1 max-h-72 w-60 overflow-y-auto rounded-[14px] bg-surface p-1 shadow-[var(--hero-sombra-panel)]"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] text-text-muted">Sin marcar nada, la ve todo el mundo.</p>
          {opciones.map((o, i) => {
            const k = claveDestino(o.destino);
            return (
              <label
                key={k}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] text-text hover:bg-[var(--hero-relleno)] ${
                  i === SECCIONES_MENCIONABLES.length ? "mt-1 border-t border-border pt-2" : ""
                }`}
              >
                <input type="checkbox" checked={marcadas.has(k)} onChange={() => alternar(o.destino)} />
                <span className="truncate">{o.nombre}</span>
                {o.destino.tipo === "seccion" && <span className="ml-auto text-[10px] text-text-muted">Sección</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** «Solo para: Producción, Iván»: en la cabecera de una nota restringida y
 *  bajo el selector mientras se escribe. */
export function ChipSoloPara({ para, personas }: { para: Destino[]; personas: readonly PersonaPublica[] }) {
  if (para.length === 0) return null;
  const nombres = para.map((d) => nombreDestino(d, personas)).join(", ");
  return (
    <span
      title={`Solo la ven ${nombres} y quien la escribió`}
      className="rounded-full bg-[var(--hero-relleno)] px-2 py-px text-[10px] font-semibold text-text"
    >
      Solo para: {nombres}
    </span>
  );
}
