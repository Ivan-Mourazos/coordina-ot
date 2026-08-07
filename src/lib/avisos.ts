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
  /** Identidad propia y estable del aviso: `logId:tipo:ofId`. Es lo que se
   *  marca como visto — no `logId`. Una sola acción puede producir varios
   *  avisos (traspasar un pedido manda todas sus OF de una vez, y una OF
   *  puede cambiar de autor y de revisor a la vez): si el filtro de vistos
   *  comparara por logId, marcar uno como visto apagaría también los demás
   *  avisos de esa acción que nadie ha abierto. */
  clave: string;
  /** Fila de `acciones_log` que originó el aviso. Sigue siendo útil (para
   *  depurar o agrupar), pero ya no es la identidad del aviso: ver `clave`. */
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

/** Motivo con el que se registra corregir un revisor YA nombrado.
 *
 *  Se distingue del `"revisor"` con el que se guarda nombrarlo por primera
 *  vez —lo que pasa al mandar una OF a revisión— porque de aquello ya avisa
 *  la campana por su cuenta, mirando el estado de la OF. */
export const MOTIVO_CAMBIO_REVISOR = "revisor-cambio";

export function avisosPara(
  acciones: readonly AccionLog[],
  operarioId: string,
  vistos: ReadonlySet<string>,
): AvisoMovimiento[] {
  const out: AvisoMovimiento[] = [];
  for (const a of acciones) {
    const previoDe = new Map(a.previos.map((p) => [p.ofId, p]));
    for (const nuevo of a.cambiosOF) {
      const previo = previoDe.get(nuevo.ofId);
      if (!previo) continue; // OF que no existía en el overlay: nada que comparar

      // El filtro de "ya visto" se aplica por aviso (por su `clave`), no
      // descartando la acción entera de antemano: una acción puede traer
      // varios avisos y solo hay que apagar el que realmente se ha abierto.
      const push = (tipo: TipoAviso, otro: string | null) => {
        const clave = `${a.id}:${tipo}:${nuevo.ofId}`;
        if (vistos.has(clave)) return;
        out.push({ clave, logId: a.id, ts: a.ts, ofId: nuevo.ofId, quien: a.operarioId, tipo, otro });
      };

      // Autor. Solo de persona a persona: sacar una OF de la bandeja
      // (previo.autorId === null) ya se anuncia como "sin empezar", y avisar
      // otra vez sería el mismo hecho contado dos veces.
      if (previo.autorId !== nuevo.autorId && previo.autorId !== null) {
        if (nuevo.autorId === operarioId && a.operarioId !== operarioId)
          push("recibida", previo.autorId);
        if (previo.autorId === operarioId && a.operarioId !== operarioId)
          push("cedida", nuevo.autorId);
      }

      // Revisor: SOLO cuando se corrige uno ya elegido.
      //
      // Nombrar revisor por primera vez ocurre al mandar la OF a revisión, y
      // de eso ya avisa la campana por su cuenta ("Me toca revisar", derivado
      // del estado de la OF). Si aquí no se filtrara por motivo, el flujo más
      // frecuente de la app generaría los dos avisos a la vez para la misma
      // OF: el derivado y este.
      if (a.motivo === MOTIVO_CAMBIO_REVISOR && previo.revisorId !== nuevo.revisorId) {
        if (nuevo.revisorId === operarioId && a.operarioId !== operarioId)
          push("revisarNueva", previo.revisorId);
        if (previo.revisorId === operarioId && a.operarioId !== operarioId)
          push("revisarQuitada", nuevo.revisorId);
      }
    }
  }
  return out;
}
