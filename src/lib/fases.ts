import { partirOfId } from "./bonos";
import type { Intervalo } from "./fichaje";

// ─── Movimientos de fase (scg_Fases + sch_FasesMov) ──────────────────────────
// Además de las líneas de tiempo, OLANET lleva el estado de cada fase. El ciclo
// real, comprobado sobre sch_FasesMov (1,5 M de filas, secuencias 1→2→1→3):
//
//   1 = empezar a fichar   2 = interrumpir   3 = finalizar
//
// IT solo documentó el 2 y el 3, pero el 1 es el valor MÁS frecuente de la
// tabla (751.579 filas). Sin él, scg_Fases nunca refleja "en curso" y el
// histórico queda con interrupciones sin su inicio.
//
// El 3 no sale del fichaje: lo dispara pasar el pedido a Producción, que es
// cuando el trabajo de OT está de verdad terminado.

export const ESTADO_FASE = {
  iniciada: 1,
  interrumpida: 2,
  finalizada: 3,
} as const;

export type EstadoFase = (typeof ESTADO_FASE)[keyof typeof ESTADO_FASE];

export interface EventoFase {
  of: string;
  numope: string;
  estado: EstadoFase;
  operarioId: string; // operario del tablero; el código de RPS se resuelve al enviar
  cuando: string; // ISO
}

/** Movimientos de fase que implican unos intervalos de fichaje.
 *
 *  Cada intervalo abre (1) sus OFs al empezar y las interrumpe (2) al cerrar.
 *  Cambiar el conjunto de OFs cierra el intervalo y abre otro, así que sale la
 *  misma alternancia 1→2→1 que graba el mini-olanet. Un intervalo aún abierto
 *  genera su 1 pero todavía no su 2. */
export function eventosFaseDe(intervalos: readonly Intervalo[]): EventoFase[] {
  const eventos: EventoFase[] = [];
  for (const iv of intervalos) {
    const ofs = iv.ofIds
      .map(partirOfId)
      .filter((x): x is { of: string; numope: string } => x !== null);
    for (const { of, numope } of ofs) {
      eventos.push({ of, numope, estado: ESTADO_FASE.iniciada, operarioId: iv.operarioId, cuando: iv.inicio });
      if (iv.fin !== null) {
        eventos.push({ of, numope, estado: ESTADO_FASE.interrumpida, operarioId: iv.operarioId, cuando: iv.fin });
      }
    }
  }
  return eventos;
}

/** Movimientos de finalización al pasar un pedido a Producción: una fase por
 *  OF del pedido. Las anuladas no se pasan — no son trabajo de OT. */
export function eventosFinalizacion(
  ofIds: readonly string[],
  operarioId: string,
  cuando: string,
): EventoFase[] {
  return ofIds
    .map(partirOfId)
    .filter((x): x is { of: string; numope: string } => x !== null)
    .map(({ of, numope }) => ({
      of,
      numope,
      estado: ESTADO_FASE.finalizada,
      operarioId,
      cuando,
    }));
}
