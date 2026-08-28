// ─── Qué ha cambiado en la web ───────────────────────────────────────────────
// Lo que el equipo ve al entrar después de una actualización. Se escribe A MANO
// y en el idioma de quien lo va a leer: los mensajes de los commits dicen cosas
// como "la migración de `revisada` podía dejar la base a medias", y eso no le
// dice nada a nadie que no haya escrito el código.
//
// LA REGLA PARA AÑADIR UNA ENTRADA: cuéntalo como se lo contarías a un
// compañero en el pasillo. Qué cambia para él y qué tiene que hacer, si es que
// tiene que hacer algo. Nada de nombres de ficheros, de campos ni de estados
// internos.
//
// Y solo lo que SE NOTA. Un arreglo de base de datos que nadie va a percibir no
// va aquí: llenar esto de cosas invisibles enseña a saltárselo.

import DATOS from "./novedades-datos.json";

export type TipoCambio = "nuevo" | "arreglado" | "mejor";

export interface Cambio {
  tipo: TipoCambio;
  /** Una frase que se entienda sola. */
  titulo: string;
  /** El detalle, si hace falta. Dos líneas como mucho. */
  detalle?: string;
}

export interface Novedad {
  /** Fijo y escrito a mano. NO cambia nunca una vez publicado: es lo que
   *  compara "esto ya lo he leído", y moverlo le volvería a saltar el aviso a
   *  todo el equipo. */
  id: string;
  /** Hasta qué commit llega esta entrada. Lo usa `pnpm novedades` para saber
   *  desde dónde mirar la próxima vez; no se enseña en ningún sitio. */
  hasta: string | null;
  cambios: Cambio[];
}

/** De la más reciente a la más antigua, que es como se lee.
 *
 *  LAS ENTRADAS NO SE ESCRIBEN AQUÍ. Se generan con `pnpm novedades`, que las
 *  saca de las líneas `Novedad:` de los commits desde la última publicada. La
 *  frase se escribe al hacer el cambio, que es cuando se sabe lo que se hizo;
 *  acordarse después, al desplegar, releyendo veinte commits, es lo que no se
 *  hace nunca.
 *
 *  Van en un JSON y no aquí porque quien las escribe es un script, y
 *  reescribir TypeScript a base de expresiones regulares se rompe solo.
 *
 *  Y AQUÍ NO HAY FECHAS: la de una actualización no se sabe al escribirla,
 *  sino cuando sale. La sella el servidor la primera vez que arranca con la
 *  entrada dentro (ver `fechasDeNovedades`), y ya no se mueve.
 */
export const NOVEDADES: readonly Novedad[] = DATOS as readonly Novedad[];
/** La última actualización que hay. `null` si no hay ninguna. */
export const ULTIMA: string | null = NOVEDADES[0]?.id ?? null;

/** Cuántas actualizaciones se ha perdido esta persona.
 *
 *  Por POSICIÓN en la lista, no comparando fechas: las fechas las pone el
 *  servidor al arrancar y podrían no estar todavía, mientras que el orden de la
 *  lista es fijo y es el que manda. Quien no entra en dos semanas tiene que ver
 *  que hay varias, no solo la última.
 *
 *  Sin nada guardado —navegador nuevo, o quien entra por primera vez— NO se
 *  avisa: estrenar la web con un aviso de "novedades" de cosas que nunca ha
 *  visto de otra forma es ruido. Se da por leído al vuelo y a partir de ahí sí
 *  se entera de las próximas.
 *
 *  Un `visto` que ya no existe en la lista (se borró una entrada) cuenta como
 *  "no visto nada": es raro, y es mejor enseñar de más que tragarse el aviso. */
export function cuantasNuevas(visto: string | null): number {
  if (visto === null) return 0;
  const i = NOVEDADES.findIndex((n) => n.id === visto);
  return i < 0 ? NOVEDADES.length : i;
}

export const ETIQUETA: Record<TipoCambio, string> = {
  nuevo: "Nuevo",
  arreglado: "Arreglado",
  mejor: "Mejor",
};
