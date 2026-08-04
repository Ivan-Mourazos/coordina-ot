import type { OF } from "./types";

// ─── Las cuatro fases del tablero ────────────────────────────────────────────
// Definición ÚNICA. Antes vivía copiada en PedidosPorEstado (bucketDe),
// TecnicoCard (faseDe) y Zona (faseIdx), con etiquetas y colores distintos en
// cada sitio; al cambiar un nombre había que acordarse de los tres.

export type Fase = "sinEmpezar" | "planteando" | "esperandoRevision" | "listoParaPasar";

export interface FaseMeta {
  id: Fase;
  label: string;
  /** Color del punto y de la barra de carga. Literal, no clase de Tailwind:
   *  se usa en `style`, porque Tailwind no compila clases construidas. */
  color: string;
}

export const FASES: readonly FaseMeta[] = [
  { id: "sinEmpezar", label: "Sin empezar", color: "#9ca3af" },
  { id: "planteando", label: "Planteando", color: "#059669" },
  // "Esperando revisión", no "Para revisar": es MI trabajo en manos de otro.
  // Lo que me toca revisar a mí vive en la pestaña Revisión.
  { id: "esperandoRevision", label: "Esperando revisión", color: "#7c3aed" },
  { id: "listoParaPasar", label: "Listo para pasar", color: "#0891b2" },
];

/** Pedido visto desde el tablero: solo hacen falta sus OFs. */
export interface ConOFs {
  ofs: OF[];
}

export function faseDeOF(of: OF): Fase {
  if (of.estado === "aprobada") return "listoParaPasar";
  if (of.estado === "por_revisar" || of.estado === "en_revision") return "esperandoRevision";
  if (of.estado === "en_curso" || of.estado === "devuelta") return "planteando";
  // Pendiente pero con tiempo o con alguien fichando: ya está en marcha.
  return of.tiempoPlanteoMin > 0 || of.fichandoRol ? "planteando" : "sinEmpezar";
}

/** Fase del pedido entero. Manda lo que está más "en marcha": un pedido con
 *  una OF planteándose está planteándose, aunque las demás estén aprobadas. */
export function faseDePedido(p: ConOFs): Fase {
  if (p.ofs.length === 0) return "sinEmpezar";
  const fases = p.ofs.map(faseDeOF);
  if (fases.every((f) => f === "listoParaPasar")) return "listoParaPasar";
  if (fases.some((f) => f === "planteando")) return "planteando";
  if (fases.some((f) => f === "esperandoRevision")) return "esperandoRevision";
  return "sinEmpezar";
}

export interface GrupoFase<T> extends FaseMeta {
  items: T[];
}

/** Reparte pedidos en las cuatro fases. Devuelve SIEMPRE las cuatro, también
 *  vacías: quien pinta decide si una fase vacía ocupa sitio o no. */
export function agruparPorFase<T extends ConOFs>(pedidos: readonly T[]): GrupoFase<T>[] {
  return FASES.map((meta) => ({
    ...meta,
    items: pedidos.filter((p) => faseDePedido(p) === meta.id),
  }));
}

/** Recorta a `tope` elementos y dice cuántos se quedan fuera. Es lo que hace
 *  que la zona personal mida lo mismo con 5 pedidos que con 40. */
export function conTope<T>(items: readonly T[], tope: number): { visibles: T[]; resto: number } {
  return {
    visibles: items.slice(0, tope),
    resto: Math.max(0, items.length - tope),
  };
}

/** ¿Se puede quitar este pedido a un compañero? Solo si no ha empezado.
 *  Moverlo con tiempo ya fichado dejaría las horas a nombre de una persona y
 *  el trabajo a nombre de otra. */
export function arrastrableDeCompanero(p: ConOFs): boolean {
  if (p.ofs.length === 0) return false;
  return p.ofs.every(
    (o) => o.estado === "pendiente" && o.tiempoPlanteoMin === 0 && !o.fichandoRol,
  );
}
