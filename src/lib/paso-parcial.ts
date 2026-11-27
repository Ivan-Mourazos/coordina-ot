// Pasar solo unas OF del pedido (Iván, 17/11/2026). En el 5335 había 15 OF,
// 2 detenidas y 13 aprobadas, y su autor quería pasar solo unas: el resto es
// trabajo suyo que pasará más tarde.
//
// Desde el 27/11/2026 va en el "⋯" del pedido («Dar por terminadas…»), no en
// «Pasar a Producción», que vuelve a ser siempre el pedido entero. Las marcadas
// se dan por terminadas en RPS una a una (POST /api/fases/cerrar-of con
// `pasoParcial`) y el pedido se queda en el tablero con las demás.

import { accionesDisponibles } from "./acciones";
import { ofDeTaller, ofsQueCuentan } from "./fases-tablero";
import type { OF, Pedido } from "./types";

/** OF que aún pasan a Producción con el pedido entero. */
export function codigosOFDelPase(ofs: OF[]): string[] {
  return ofs.filter(of => of.estado !== "anulada" && !of.ajenaOT && !of.detenida && !of.cerradaRps).map(of => of.codigo);
}

export interface OFDelPase {
  of: OF;
  /** Se puede desmarcar y dar por terminada por separado. */
  elegible: boolean;
  /** Por qué no: detenida (no se pasa nunca), de otro autor (solo él la
   *  cierra suelta; en el pase entero sí va) o mandada a revisar (con el
   *  pedido a medias, no se cierra hasta que la aprueben). */
  motivo?: "detenida" | "de_otro" | "en_revision";
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

// ─── «Dar por terminadas…» (Iván, 27/11/2026) ───────────────────────────────
// En el "⋯" del pedido: la lista de sus OF, todas marcadas, y se desmarcan las
// que se dejan. Las marcadas se cierran por cerrar-of con `pasoParcial`, así
// que el servidor exige que quede otra OF sin cerrar; el pedido sigue en el
// tablero con el resto. «Pasar a Producción» es siempre el pedido entero.

/** La lista de «Dar por terminadas…»: además de lo de `ofsDelPase`,
 *  solo se marcan las que admiten cerrarse (no las mandadas a revisar). */
export function ofsDelPaseParcial(ofs: OF[], miId: string | null): OFDelPase[] {
  return ofsDelPase(ofs, miId).map((x) =>
    !x.elegible || accionesDisponibles(x.of, miId).some((a) => a.id === "cerrar_en_rps")
      ? x
      : { of: x.of, elegible: false, motivo: "en_revision" as const },
  );
}

/** ¿Sale «Dar por terminadas…»? Hace falta una OF mía que se pueda cerrar y
 *  otra que se quede (el pedido entero es «Pasar a Producción»). */
export function puedeDarPorTerminadas(p: Pick<Pedido, "ofs" | "situacion">, miId: string | null): boolean {
  if (p.situacion === "completado" || miId === null) return false;
  const quedan = ofsQueCuentan(p).filter((o) => !o.cerradaRps).length;
  return quedan >= 2 && ofsDelPaseParcial(p.ofs, miId).some((x) => x.elegible);
}

export type DecisionPaseParcial =
  | { tipo: "parcial"; ofIds: string[] }
  | { tipo: "nada" }
  /** Marcadas todas las que quedan: la última pasa con el pedido entero. */
  | { tipo: "todas" };

/** Lo marcado con el pedido a medias. Como en el pase, se guarda lo
 *  DESMARCADO: de serie van todas. */
export function decidirPaseParcial(ofs: OF[], miId: string | null, desmarcadas: ReadonlySet<string>): DecisionPaseParcial {
  const ofIds = ofsDelPaseParcial(ofs, miId).filter((x) => x.elegible && !desmarcadas.has(x.of.id)).map((x) => x.of.id);
  if (ofIds.length === 0) return { tipo: "nada" };
  // La misma condición que pone el servidor a cada una (ver cerrar-of).
  const quedaOtra = ofsQueCuentan({ ofs }).some((o) => !o.cerradaRps && !ofIds.includes(o.id));
  return quedaOtra ? { tipo: "parcial", ofIds } : { tipo: "todas" };
}
