import type { AccionLog } from "./server/estado-db";

// ─── Avisos de "te han movido el trabajo" ────────────────────────────────────
// Los tres avisos originales de la campana se DEDUCEN mirando la OF (me toca
// revisar, me la han devuelto, la tengo sin empezar). Un cambio de manos no
// deja marca en la OF: pasado un segundo, mirándola, no hay forma de saber que
// antes era de otro. Por eso estos se leen del registro de acciones.
//
// Función pura: recibe el registro ya leído y devuelve ids. El texto lo compone
// el cliente, que es quien tiene los nombres de los operarios y los códigos de
// pedido; el servidor no necesita cargar el tablero (que en RPS tarda 7-15 s).

export type TipoAviso = "recibida" | "cedida" | "revisarNueva" | "revisarQuitada";

export interface AvisoMovimiento {
  /** Fila de `acciones_log`. Es lo que se marca como visto. */
  logId: number;
  ts: string;
  tipo: TipoAviso;
  ofId: string;
  /** Quién hizo el cambio. */
  quien: string | null;
  /** La otra parte: de quién venía, o a quién ha ido. */
  otro: string | null;
}

/** Cuánto aguanta un aviso que nunca se ha llegado a ver.
 *
 *  Los avisos se apagan al abrir el pedido, pero si nunca se abre no se
 *  apagarían solos y la campana arrastraría un traspaso de hace ocho meses de
 *  un pedido que ya ni existe. Un mes cubre unas vacaciones largas o una baja
 *  corta —el caso para el que se diseñó esto—; pasado eso, el trabajo o se ha
 *  hecho o se ha vuelto a mover. */
export const VENTANA_AVISOS_DIAS = 30;

export function avisosPara(
  acciones: readonly AccionLog[],
  operarioId: string,
  vistos: ReadonlySet<number>,
): AvisoMovimiento[] {
  const out: AvisoMovimiento[] = [];
  for (const a of acciones) {
    if (vistos.has(a.id)) continue;
    const previoDe = new Map(a.previos.map((p) => [p.ofId, p]));
    for (const nuevo of a.cambiosOF) {
      const previo = previoDe.get(nuevo.ofId);
      if (!previo) continue; // OF que no existía en el overlay: nada que comparar

      const base = { logId: a.id, ts: a.ts, ofId: nuevo.ofId, quien: a.operarioId };

      // Autor. Solo de persona a persona: sacar una OF de la bandeja
      // (previo.autorId === null) ya se anuncia como "sin empezar", y avisar
      // otra vez sería el mismo hecho contado dos veces.
      if (previo.autorId !== nuevo.autorId && previo.autorId !== null) {
        if (nuevo.autorId === operarioId && a.operarioId !== operarioId)
          out.push({ ...base, tipo: "recibida", otro: previo.autorId });
        if (previo.autorId === operarioId && a.operarioId !== operarioId)
          out.push({ ...base, tipo: "cedida", otro: nuevo.autorId });
      }

      // Revisor. Aquí sí cuenta pasar de "sin revisor" a tenerlo: nombrar
      // revisor es siempre encargarle algo a alguien.
      if (previo.revisorId !== nuevo.revisorId) {
        if (nuevo.revisorId === operarioId && a.operarioId !== operarioId)
          out.push({ ...base, tipo: "revisarNueva", otro: previo.revisorId });
        if (previo.revisorId === operarioId && a.operarioId !== operarioId)
          out.push({ ...base, tipo: "revisarQuitada", otro: nuevo.revisorId });
      }
    }
  }
  return out;
}
