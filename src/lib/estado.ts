import type { EstadoOF, OF } from "./types";

// Clases Tailwind literales (deben aparecer como texto para que se compilen).
export interface EstadoMeta {
  label: string;
  short: string;
  dot: string; // color sólido (badges, puntos)
  border: string; // borde de tarjeta
  chip: string; // fondo+texto para badge
  rank: number; // prioridad para elegir estado representativo de un grupo
}

export const ESTADO: Record<EstadoOF, EstadoMeta> = {
  pendiente: {
    label: "Pendiente",
    short: "Pend.",
    dot: "bg-gray-400",
    border: "border-border",
    chip: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
    rank: 1,
  },
  en_curso: {
    label: "En curso",
    short: "Curso",
    dot: "bg-emerald-600",
    border: "border-emerald-400",
    chip: "bg-emerald-600 text-white",
    rank: 2,
  },
  aprobada: {
    label: "Aprobada",
    short: "OK",
    dot: "bg-teal-600",
    border: "border-teal-400",
    chip: "bg-teal-600 text-white",
    rank: 3,
  },
  en_revision: {
    label: "En revisión",
    short: "Revis.",
    dot: "bg-violet-600",
    border: "border-violet-400",
    chip: "bg-violet-600 text-white",
    rank: 5,
  },
  por_revisar: {
    label: "Por revisar",
    short: "Por rev.",
    dot: "bg-amber-500",
    border: "border-amber-400",
    chip: "bg-amber-500 text-white",
    rank: 6,
  },
  devuelta: {
    label: "Devuelta",
    short: "Devuelta",
    dot: "bg-red-600",
    border: "border-red-500",
    chip: "bg-red-600 text-white",
    rank: 7,
  },
};

export const ESTADOS_ORDEN: EstadoOF[] = [
  "pendiente",
  "en_curso",
  "por_revisar",
  "en_revision",
  "aprobada",
  "devuelta",
];

/** Estado "más relevante" de un conjunto de OFs (mayor rank manda). */
export function estadoRepresentativo(ofs: OF[]): EstadoOF {
  let best: EstadoOF = "pendiente";
  for (const of of ofs) {
    if (ESTADO[of.estado].rank > ESTADO[best].rank) best = of.estado;
  }
  return best;
}

export function fmtMin(min: number): string {
  if (!min) return "0h";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}
