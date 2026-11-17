"use client";

import { ETIQUETA_ESTADO, type EstadoDia, type FueraHoy } from "@/lib/disponibilidad";
import { sumarDias } from "@/lib/fechas";

// ─── Piezas comunes de la disponibilidad (Bizneo) ────────────────────────────
// El color dice el estado, igual en el calendario, en la tarjeta del tablero y
// en la pantalla de Producción. Lo que importa ver de un vistazo es quién NO
// está: por eso «trabaja» va sin color y las ausencias van macizas.
// Texto AA sobre cada fondo en los dos temas (700 con blanco, 300 con 950).

export const TONO_ESTADO: Record<EstadoDia, string> = {
  trabaja: "",
  teletrabajo: "bg-violet-500/20 text-violet-900 dark:text-violet-200",
  parcial: "bg-amber-300 text-amber-950",
  vacaciones: "bg-sky-700 text-white",
  fuera: "bg-rose-700 text-white",
  festivo: "bg-[var(--hero-relleno-encima)] text-text",
  libre: "bg-[var(--hero-relleno)] text-text-muted",
  sin_dato: "text-text-muted",
};

/** Una letra por estado para la celda del calendario (el color solo no basta). */
export const LETRA_ESTADO: Record<EstadoDia, string> = {
  trabaja: "",
  teletrabajo: "T",
  parcial: "½",
  vacaciones: "V",
  fuera: "A",
  festivo: "F",
  libre: "",
  sin_dato: "·",
};

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** «mañana», «el lun 24». */
export function fmtVuelve(iso: string, hoy: string): string {
  if (iso === sumarDias(hoy, 1)) return "mañana";
  const d = new Date(`${iso}T12:00:00`);
  return `el ${DIAS[d.getDay()]} ${d.getDate()}`;
}

/** «Vacaciones · vuelve el lun 24». */
export function textoFuera(f: FueraHoy, hoy: string): string {
  const base = f.estado === "parcial" ? (f.nota ?? ETIQUETA_ESTADO.parcial) : ETIQUETA_ESTADO[f.estado];
  return f.vuelve ? `${base} · vuelve ${fmtVuelve(f.vuelve, hoy)}` : base;
}

/** Distintivo pequeño: para la tarjeta de un compañero en el tablero. */
export function ChipFuera({ f, hoy, className = "" }: { f: FueraHoy; hoy: string; className?: string }) {
  return (
    <span
      className={`block max-w-full truncate rounded-full px-2 text-[10px] font-semibold leading-4 ${TONO_ESTADO[f.estado]} ${className}`}
      title={`Según Bizneo: ${textoFuera(f, hoy)}`}
    >
      {textoFuera(f, hoy)}
    </span>
  );
}

/** «Hoy fuera: …» en una tira. No pinta nada si no falta nadie o no hay datos. */
export function FueraHoyTira({
  fuera,
  hoy,
  conTeletrabajo = true,
  className = "",
}: {
  fuera: FueraHoy[] | null;
  hoy: string;
  /** Producción no necesita saber quién está en casa: solo quién falta. */
  conTeletrabajo?: boolean;
  className?: string;
}) {
  const lista = (fuera ?? []).filter((f) => conTeletrabajo || f.estado !== "teletrabajo");
  if (lista.length === 0) return null;
  return (
    <section aria-label="Quién falta hoy" className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="mr-1 text-xs font-semibold text-text-muted">Hoy fuera</span>
      {lista.map((f) => (
        <span
          key={f.id}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${TONO_ESTADO[f.estado] || "bg-[var(--hero-relleno)] text-text"}`}
          title={`${f.grupo} · ${textoFuera(f, hoy)}`}
        >
          <span className="font-semibold">{f.nombre}</span>
          <span>· {textoFuera(f, hoy)}</span>
        </span>
      ))}
    </section>
  );
}
