// «Pasar a Producción» eligiendo qué OF (Iván, 17/11/2026). En el 5335 había
// 15 OF, 2 detenidas y 13 aprobadas, y su autor quería pasar solo unas: el
// resto es trabajo suyo que pasará más tarde.
//
// Todas marcadas de serie, que es lo normal: entonces el pase es el de
// siempre. Si se desmarca alguna, las marcadas se dan por terminadas en RPS
// una a una (POST /api/fases/cerrar-of con `pasoParcial`) y el pedido se queda
// en el tablero con las demás.

import { accionesDisponibles } from "./acciones";
import { ofDeTaller, ofsQueCuentan } from "./fases-tablero";
import type { OF } from "./types";

/** OF que aún pasan a Producción con el pedido entero. */
export function codigosOFDelPase(ofs: OF[]): string[] {
  return ofs.filter(of => of.estado !== "anulada" && !of.ajenaOT && !of.detenida && !of.cerradaRps).map(of => of.codigo);
}

export interface OFDelPase {
  of: OF;
  /** Se puede desmarcar y dar por terminada por separado. */
  elegible: boolean;
  /** Por qué no: detenida (no se pasa nunca) o de otro autor (solo él la
   *  cierra suelta; en el pase entero sí va). */
  motivo?: "detenida" | "de_otro";
}

/** Las OF que salen en la lista del pase: las de Oficina Técnica que aún no
 *  se han pasado. Sin anuladas, sin las de taller y sin las ya cerradas en RPS
 *  (se pasaron sueltas antes). */
export function ofsDelPase(ofs: OF[], miId: string | null): OFDelPase[] {
  return ofs
    .filter((o) => o.estado !== "anulada" && !ofDeTaller(o) && !o.cerradaRps)
    .map((of) =>
      of.detenida
        ? { of, elegible: false, motivo: "detenida" as const }
        : of.autorId !== miId
          ? { of, elegible: false, motivo: "de_otro" as const }
          : { of, elegible: true },
    );
}

/** ¿Tiene sentido ofrecer las casillas? Hace falta poder dejar al menos una
 *  para luego y pasar al menos otra: dos mías, como mínimo. */
export function hayEleccion(lista: OFDelPase[]): boolean {
  return lista.filter((x) => x.elegible).length >= 2;
}

export type DecisionPase =
  | { tipo: "todo" }
  | { tipo: "parcial"; ofIds: string[] }
  | { tipo: "nada" };

// ─── «Dar por terminadas varias…» (Iván, 27/11/2026) ────────────────────────
// Desde el "⋯" de una OF: elegir varias del pedido y darlas por terminadas en
// RPS de golpe, sin esperar a que el pedido entero esté aprobado. Van por el
// mismo camino que el pase parcial (cerrar-of con `pasoParcial`), así que el
// servidor exige lo mismo: que quede otra OF del pedido sin cerrar.

export interface OFParaCerrar {
  of: OF;
  elegible: boolean;
  /** Por qué no se puede marcar: detenida, de otro autor, o en un estado
   *  desde el que no se cierra (mandada a revisar). */
  motivo?: "detenida" | "de_otro" | "en_revision";
}

export function ofsParaCerrarVarias(ofs: OF[], miId: string | null): OFParaCerrar[] {
  return ofsDelPase(ofs, miId).map(({ of, elegible, motivo }) =>
    !elegible
      ? { of, elegible, motivo }
      : accionesDisponibles(of, miId).some((a) => a.id === "cerrar_en_rps")
        ? { of, elegible: true }
        : { of, elegible: false, motivo: "en_revision" as const },
  );
}

/** ¿Se ofrece la opción? Hace falta poder marcar dos y dejar otra sin cerrar:
 *  con una sola, ya está «Dar por terminada en RPS». */
export function hayCierreVarias(ofs: OF[], miId: string | null): boolean {
  const lista = ofsParaCerrarVarias(ofs, miId);
  return lista.filter((x) => x.elegible).length >= 2 && lista.length >= 3;
}

export type DecisionCierreVarias =
  | { tipo: "cerrar"; ofIds: string[] }
  | { tipo: "nada" }
  /** Se marcaron todas las que quedan: la última pasa con el pedido. */
  | { tipo: "todas" };

export function decidirCierreVarias(ofs: OF[], miId: string | null, marcadas: ReadonlySet<string>): DecisionCierreVarias {
  const lista = ofsParaCerrarVarias(ofs, miId);
  const ofIds = lista.filter((x) => x.elegible && marcadas.has(x.of.id)).map((x) => x.of.id);
  if (ofIds.length === 0) return { tipo: "nada" };
  // La misma condición que pone el servidor a cada una (ver cerrar-of).
  const quedaOtra = ofsQueCuentan({ ofs }).some((o) => !o.cerradaRps && !ofIds.includes(o.id));
  return quedaOtra ? { tipo: "cerrar", ofIds } : { tipo: "todas" };
}

/** Qué hacer con lo marcado. Nada desmarcado = el pase de siempre. */
export function decidirPase(lista: OFDelPase[], desmarcadas: ReadonlySet<string>): DecisionPase {
  const mias = lista.filter((x) => x.elegible);
  if (!mias.some((x) => desmarcadas.has(x.of.id))) return { tipo: "todo" };
  const ofIds = mias.filter((x) => !desmarcadas.has(x.of.id)).map((x) => x.of.id);
  return ofIds.length === 0 ? { tipo: "nada" } : { tipo: "parcial", ofIds };
}
