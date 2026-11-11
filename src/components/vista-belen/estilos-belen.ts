import type { EstadoOperacion } from "@/lib/vista-belen";
import { esFinalizada } from "@/lib/vista-belen";

// ─── Colores y nombres de la vista de Belén, en un solo sitio ────────────────
// Antes cada pantalla tenía su versión de los chips (situación, estado,
// material) con tonos, tamaños y pesos distintos para lo mismo, y cada dato se
// llamaba de dos maneras. Aquí: un chip por significado y un nombre por dato.
// El color comunica estado (HeroUI lo permite); lo demás va con tokens.

export type Tono = "ok" | "aviso" | "error" | "info" | "neutro";

/** Fondo tintado y tinta oscura (clara en oscuro): contraste AA en los dos
 *  temas, sin opacidad en el texto. */
export const TONO: Record<Tono, string> = {
  ok: "bg-emerald-500/12 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200",
  aviso: "bg-amber-500/15 text-amber-900 dark:bg-amber-400/15 dark:text-amber-100",
  error: "bg-red-500/12 text-red-800 dark:bg-red-400/15 dark:text-red-200",
  info: "bg-blue-500/12 text-blue-800 dark:bg-blue-400/15 dark:text-blue-200",
  neutro: "bg-[var(--hero-relleno)] text-text",
};

/** Un chip: siempre el mismo tamaño y peso. */
export const chip = (tono: Tono) => `inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${TONO[tono]}`;

/** Situación de la OF en RPS: finalizada bien, detenida mal, el resto (lanzada,
 *  impresa, con imputaciones) en marcha. */
export function tonoSituacion(situacion: string | null | undefined): Tono {
  const v = (situacion ?? "").trim().toUpperCase();
  if (esFinalizada(v) || v === "SI") return "ok";
  if (v === "DETENIDA" || v === "NO") return "error";
  return v ? "aviso" : "neutro";
}

/** Estado de una operación, igual en la ficha y en «Tareas y tiempos». */
export const ESTADO_OPERACION: Record<EstadoOperacion, { texto: string; tinta: string; punto: string }> = {
  finalizado: { texto: "Finalizado", tinta: "text-emerald-700 dark:text-emerald-300", punto: "bg-emerald-500 dark:bg-emerald-400" },
  interrumpido: { texto: "Interrumpido", tinta: "text-amber-700 dark:text-amber-300", punto: "bg-amber-500 dark:bg-amber-400" },
  sin_empezar: { texto: "Sin empezar", tinta: "text-text-muted", punto: "bg-[var(--hero-relleno-encima)]" },
};

/** Un nombre por dato, el mismo en todas las pantallas. Las fechas, con los
 *  colores que pidió Belén (10/11/2026). */
export const FECHA = {
  solicitada: { rotulo: "Solicitada", tinta: "text-red-700 dark:text-red-300" },
  comprometida: { rotulo: "Comprometida", tinta: "text-emerald-700 dark:text-emerald-300" },
  logistica: { rotulo: "Logística", tinta: "text-purple-700 dark:text-purple-300" },
  compras: { rotulo: "Compras", tinta: "text-blue-700 dark:text-blue-300" },
} as const;
