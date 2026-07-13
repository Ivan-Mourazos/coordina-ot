import type { EstadoOF, OF, Prioridad, Rol } from "./types";

// ─── Prioridad del trabajo ───────────────────────────────────────────────────
// Escala real de OT: 1 = poca, 2 = normal, 3 = urgente. Si es 3, la fecha de
// planificación se respeta al 100%. Colores: urgente rojo, normal ámbar, poca
// gris. Se ordena de más urgente (3) a menos (1) → usar `rank` descendente.
export interface PrioridadMeta {
  label: string;
  color: string; // sólido para el badge (Pxx)
  rank: number; // 3 urgente = más alto; para ordenar desc
}

export const PRIORIDAD: Record<Prioridad, PrioridadMeta> = {
  3: { label: "Urgente", color: "#d23b3b", rank: 3 },
  2: { label: "Normal", color: "#d39a1c", rank: 2 },
  1: { label: "Poca", color: "#6b7280", rank: 1 },
};

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
    // Cian frío, no teal: en tema oscuro el teal se confundía con el
    // esmeralda de "en curso" (cuatro verdes compitiendo en pantalla).
    dot: "bg-cyan-600",
    border: "border-cyan-400",
    chip: "bg-cyan-600 text-white",
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
  anulada: {
    label: "Anulada",
    short: "Anul.",
    dot: "bg-slate-400",
    border: "border-slate-300",
    chip: "bg-slate-200 text-slate-700",
    rank: 0,
  },
};

// Código de color por ROL de fichaje, usado en toda la app: quien PLANTEA va
// en esmeralda (= "en curso"), quien REVISA va en violeta (= "en revisión").
// Mismo par de colores en tarjetas, chips, cabecera y drawer para que "quién
// está fichando y con qué rol" se lea igual en todas partes.
export interface RolMeta {
  label: string; // "Planteando" / "Revisando"
  color: string; // sólido para dots/anillos
  chip: string; // clases del badge
  solido: string; // variante sólida para botones de acción del rol
}

export const ROL: Record<Rol, RolMeta> = {
  plantear: {
    label: "Planteando",
    color: "#059669",
    chip: "bg-emerald-600/12 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    solido: "bg-emerald-600 text-white hover:bg-emerald-700",
  },
  revisar: {
    label: "Revisando",
    color: "#7c3aed",
    chip: "bg-violet-600/12 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
    solido: "bg-violet-600 text-white hover:bg-violet-700",
  },
};

export const ESTADOS_ORDEN: EstadoOF[] = [
  "anulada",
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
