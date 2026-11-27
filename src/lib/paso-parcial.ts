// «Pasar a Producción» eligiendo qué OF (Iván, 17/11/2026). En el 5335 había
// 15 OF, 2 detenidas y 13 aprobadas, y su autor quería pasar solo unas: el
// resto es trabajo suyo que pasará más tarde.
//
// Todas marcadas de serie, que es lo normal: entonces el pase es el de
// siempre. Si se desmarca alguna, las marcadas se dan por terminadas en RPS
// una a una (POST /api/fases/cerrar-of con `pasoParcial`) y el pedido se queda
// en el tablero con las demás.

import { ofDeTaller } from "./fases-tablero";
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

/** Qué hacer con lo marcado. Nada desmarcado = el pase de siempre. */
export function decidirPase(lista: OFDelPase[], desmarcadas: ReadonlySet<string>): DecisionPase {
  const mias = lista.filter((x) => x.elegible);
  if (!mias.some((x) => desmarcadas.has(x.of.id))) return { tipo: "todo" };
  const ofIds = mias.filter((x) => !desmarcadas.has(x.of.id)).map((x) => x.of.id);
  return ofIds.length === 0 ? { tipo: "nada" } : { tipo: "parcial", ofIds };
}
