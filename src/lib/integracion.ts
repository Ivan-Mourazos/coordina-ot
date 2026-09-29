import { timingSafeEqual } from "node:crypto";

// ─── Integración de solo lectura con la web de planteamientos ────────────────
// La web de toldos (y después la de remolques) pregunta cómo están sus OF para
// enseñar «aprobado» o «devuelto» sin que nadie lo copie a mano. CoordinaOT
// manda: aquí solo se lee, y solo se cuenta el estado de las OF que se piden.

export const MAX_OFS = 50;
const OF_RE = /^\d{5,9}$/;

export type EstadoIntegracion =
  | "pendiente" | "en_curso" | "por_revisar" | "en_revision"
  | "devuelta" | "aprobada" | "anulada" | "sin_estado";

export interface EstadoOfIntegracion {
  of: string;
  estado: EstadoIntegracion;
  nota: string;
  actualizado: string | null;
  // Quién la aprobó, solo si está aprobada. Es el único dato de personas que
  // sale de CoordinaOT: la web de planteamientos lo pone en su campo REVISOR
  // para que nadie tenga que escribirlo a mano.
  revisor: string;
}

export interface FilaOverlayOf {
  estado: string;
  observacion: string | null;
  updatedAt: string;
  revisorId: string | null;
}

// De menos a más avanzada. Con varias tareas de la misma OF manda la primera
// de esta lista: una devuelta gana a una aprobada, y así nunca se da por buena
// una OF que alguien ha parado. `anulada` es la excepción: una tarea anulada (p. ej.
// un duplicado de RPS) no es trabajo pendiente ni parado, así que resumirOf la ignora
// mientras la OF tenga otra tarea; solo si todas están anuladas la OF sale anulada.
const AVANCE: readonly EstadoIntegracion[] = [
  "devuelta", "pendiente", "en_curso", "por_revisar", "en_revision", "anulada", "aprobada",
];

/** Compara en tiempo constante; sin clave configurada no vale ninguna. */
export function claveValida(recibida: string | null, esperada: string | undefined): boolean {
  if (!esperada || !recibida) return false;
  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `?ofs=0230194,0230195` → lista sin repetidas, o null si algo no es una OF. */
export function leerOfsPedidas(param: string | null): string[] | null {
  const ofs = [...new Set((param ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
  if (ofs.length === 0 || ofs.length > MAX_OFS) return null;
  return ofs.every((of) => OF_RE.test(of)) ? ofs : null;
}

function normalizar(estado: string): EstadoIntegracion {
  return (AVANCE as readonly string[]).includes(estado) ? (estado as EstadoIntegracion) : "pendiente";
}

export function resumirOf(of: string, filas: readonly FilaOverlayOf[]): EstadoOfIntegracion {
  if (filas.length === 0) return { of, estado: "sin_estado", nota: "", actualizado: null, revisor: "" };
  const todas = filas.map((f) => ({ ...f, normal: normalizar(f.estado) }));
  // Una tarea anulada no debe bloquear la OF para siempre: con `anulada` antes que
  // `aprobada` en AVANCE, un duplicado anulado junto a la tarea aprobada de OT dejaba la
  // OF sin poder generarse en toldos. Se descartan mientras quede alguna no anulada.
  const vivas = todas.filter((f) => f.normal !== "anulada");
  const conEstado = vivas.length > 0 ? vivas : todas;
  const peor = conEstado.reduce((a, b) => (AVANCE.indexOf(b.normal) < AVANCE.indexOf(a.normal) ? b : a));
  const actualizado = conEstado.map((f) => f.updatedAt).sort().at(-1) ?? null;
  // Si la OF no está aprobada del todo no hay revisor que dar: un nombre ahí
  // haría creer en planteamientos que alguien ya la ha dado por buena. Con
  // varias tareas aprobadas vale la última aprobación, que es la que cierra.
  const ultimaAprobada = peor.normal === "aprobada"
    ? conEstado.filter((f) => f.normal === "aprobada").reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a))
    : null;
  return {
    of,
    estado: peor.normal,
    nota: peor.normal === "devuelta" ? (peor.observacion ?? "").trim() : "",
    actualizado,
    revisor: ultimaAprobada?.revisorId ?? "",
  };
}
