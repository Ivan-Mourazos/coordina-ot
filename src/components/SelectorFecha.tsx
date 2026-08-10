"use client";

import { useState } from "react";
import { usePopover } from "@/lib/usePopover";
import { hoyISO } from "@/lib/types";
import { sumarDias } from "@/lib/fechas";
import {
  DIAS_SEMANA,
  nombreMes,
  primerDiaDelMes,
  resumenRango,
  semanaDe,
  semanasDelMes,
  sumarMeses,
} from "@/lib/calendario";

// ─── Calendario del filtro de planificación ──────────────────────────────────
// Sustituye a dos `input[type=date]` seguidos. Aquellos tenían dos problemas:
// el navegador los pinta a su manera —en medio de una barra de vidrio cantaban
// como un control ajeno— y, sobre todo, obligaban a rellenar DOS campos para la
// pregunta que se hace a diario, que es de un solo día: "¿qué hay planificado
// para el jueves?".
//
// Aquí un clic es un día. El rango existe, pero detrás de una pestaña: es la
// consulta rara, y ponerla al mismo nivel obligaba a todo el mundo a entender
// dos casillas para usar una.

type Modo = "dia" | "rango";

export function SelectorFecha({
  desde,
  hasta,
  onCambiar,
}: {
  desde: string;
  hasta: string;
  /** Un día suelto llega con `desde === hasta`: el modelo de filtros no
   *  necesita saber que existen los días sueltos, solo el rango. */
  onCambiar: (desde: string, hasta: string) => void;
}) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const hoy = hoyISO();
  // Arranca en el mes de lo ya elegido: al reabrir el filtro se vuelve a donde
  // estabas, no a hoy.
  const [mes, setMes] = useState(() => primerDiaDelMes(desde || hoy));
  const [modo, setModo] = useState<Modo>(desde && hasta && desde !== hasta ? "rango" : "dia");
  // En modo rango, el primer clic deja el principio "a la espera" del segundo.
  const [inicioRango, setInicioRango] = useState<string | null>(null);

  const resumen = resumenRango(desde, hasta);
  const enRango = (d: string) => Boolean(desde && hasta && d >= desde && d <= hasta);

  function elegir(d: string) {
    if (modo === "dia") {
      onCambiar(d, d);
      setOpen(false);
      return;
    }
    if (!inicioRango) {
      setInicioRango(d);
      // Se pinta ya como extremo suelto para que se vea que el clic contó.
      onCambiar(d, d);
      return;
    }
    // Segundo clic: se ordena solo, así da igual empezar por el final.
    const [a, b] = d < inicioRango ? [d, inicioRango] : [inicioRango, d];
    setInicioRango(null);
    onCambiar(a, b);
    setOpen(false);
  }

  function atajo(d: string, h: string) {
    setModo(d === h ? "dia" : "rango");
    setInicioRango(null);
    setMes(primerDiaDelMes(d));
    onCambiar(d, h);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Qué hay planificado para un día concreto, o entre dos fechas"
        className={`glass-chip flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-border-strong ${
          resumen ? "glass-chip-activo text-brand-700 dark:text-brand-300" : "text-text-muted"
        }`}
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
        {/* Vacío dice qué pasa si no lo tocas, no cómo se llama el campo: el
            nombre ya lo pone el rótulo del grupo ("Planificado"), y repetirlo
            aquí dejaba "PLANIFICADO  Planificado" seguido. */}
        <span>{resumen ?? "Cualquier día"}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Elegir fecha de planificación"
          className="glass-pop absolute left-0 top-full z-40 mt-1 w-[17rem] rounded-xl p-2"
        >
          {/* Un día / Rango. El rango detrás de una pestaña y no siempre a la
              vista: la consulta de todos los días es de un solo día. */}
          <div className="mb-2 flex gap-1">
            {(["dia", "rango"] as Modo[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setModo(m);
                  setInicioRango(null);
                }}
                aria-pressed={modo === m}
                className={`flex-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                  modo === m
                    ? "bg-brand-500/15 text-brand-700 ring-1 ring-brand-400 dark:text-brand-300"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {m === "dia" ? "Un día" : "Rango"}
              </button>
            ))}
          </div>

          {/* mes, con sus flechas */}
          <div className="mb-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMes(sumarMeses(mes, -1))}
              aria-label="Mes anterior"
              className="grid size-6 place-items-center rounded text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
            >
              ‹
            </button>
            <span className="flex-1 text-center text-xs font-semibold capitalize text-text">
              {nombreMes(mes)}
            </span>
            <button
              type="button"
              onClick={() => setMes(sumarMeses(mes, 1))}
              aria-label="Mes siguiente"
              className="grid size-6 place-items-center rounded text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-semibold uppercase text-text-muted">
            {DIAS_SEMANA.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {semanasDelMes(mes).flatMap((semana) =>
              semana.map((c) => {
                const esHoy = c.iso === hoy;
                const marcado = enRango(c.iso);
                return (
                  <button
                    key={c.iso}
                    type="button"
                    onClick={() => elegir(c.iso)}
                    aria-current={esHoy ? "date" : undefined}
                    aria-pressed={marcado}
                    // Los días de los meses vecinos se pintan apagados pero se
                    // pueden pulsar: al elegir el 1 de septiembre desde agosto,
                    // obligar a cambiar de mes primero es un paso de más.
                    className={`grid h-7 place-items-center rounded text-[11px] tabular-nums transition-colors ${
                      marcado
                        ? "bg-brand-500 font-bold text-white"
                        : c.delMes
                          ? "text-text hover:bg-[var(--glass-highlight)]"
                          : "text-text-muted/50 hover:bg-[var(--glass-highlight)]"
                    } ${esHoy && !marcado ? "ring-1 ring-brand-400" : ""}`}
                  >
                    {Number(c.iso.slice(8))}
                  </button>
                );
              }),
            )}
          </div>

          {/* Los atajos de verdad: lo que se pregunta a diario. */}
          <div className="mt-2 flex flex-wrap gap-1 border-t border-[var(--glass-border)] pt-2">
            <Atajo onClick={() => atajo(hoy, hoy)}>Hoy</Atajo>
            <Atajo onClick={() => atajo(sumarDias(hoy, 1), sumarDias(hoy, 1))}>Mañana</Atajo>
            <Atajo
              onClick={() => {
                const s = semanaDe(hoy);
                atajo(s.desde, s.hasta);
              }}
            >
              Esta semana
            </Atajo>
            {resumen && (
              <button
                type="button"
                onClick={() => {
                  setInicioRango(null);
                  onCambiar("", "");
                  setOpen(false);
                }}
                className="ml-auto rounded-lg px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
              >
                ✕ Quitar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Atajo({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-chip rounded-lg px-2 py-1 text-[11px] font-semibold text-text-muted hover:text-text"
    >
      {children}
    </button>
  );
}
