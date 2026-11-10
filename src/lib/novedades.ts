// ─── Qué ha cambiado en la web ───────────────────────────────────────────────
// Lo que el equipo ve al entrar después de una actualización. La frase se escribe
// en el commit y en el idioma de quien lo va a leer: los mensajes técnicos dicen cosas
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
import type { SeccionId } from "./secciones";

export type TipoCambio = "nuevo" | "arreglado" | "mejor";
export type ApartadoNovedades = SeccionId | "produccion";
/** Dirección recibe todos los apartados; los demás, el suyo y los generales. */
export type PerfilNovedades = ApartadoNovedades | "direccion" | readonly ApartadoNovedades[];
export const APARTADOS_NOVEDADES: Record<ApartadoNovedades, string> = {
  ot: "Oficina Técnica",
  diseno: "Diseño",
  impresion: "Impresión",
  produccion: "Producción",
};

export function leAfecta(cambio: Cambio, perfil: PerfilNovedades): boolean {
  return !cambio.apartado || perfil === "direccion" || (typeof perfil === "string"
    ? cambio.apartado === perfil
    : perfil.includes(cambio.apartado));
}

export function agruparCambios(cambios: readonly Cambio[], perfil: PerfilNovedades) {
  const propios = cambios.filter((c) => leAfecta(c, perfil));
  const otros = (Object.keys(APARTADOS_NOVEDADES) as ApartadoNovedades[])
    .map((apartado) => ({ apartado, cambios: cambios.filter((c) => c.apartado === apartado && !leAfecta(c, perfil)) }))
    .filter((grupo) => grupo.cambios.length > 0);
  return { propios, otros };
}

export interface Cambio {
  tipo: TipoCambio;
  /** Ausente = para todo el equipo, también en el historial anterior. */
  apartado?: ApartadoNovedades;
  /** Una frase que se entienda sola. */
  titulo: string;
  /** El detalle, si hace falta. Dos líneas como mucho. */
  detalle?: string;
  /** En qué despliegue del día llegó: 1 el primero, 2 el siguiente… Ausente
   *  = 1. Lo pone `pnpm novedades` al fundir en la entrada de hoy los cambios
   *  de un despliegue más.
   *
   *  Existe para pintar lo que es nuevo DE VERDAD (ver `cambiosSinLeer`). La
   *  entrada se ordena por tipo, no por llegada, así que sin esto lo de la
   *  tarde quedaba mezclado con lo de la mañana y no había forma de saber qué
   *  te faltaba por leer. */
  tanda?: number;
}

export interface Novedad {
  /** Fijo y escrito a mano. NO cambia nunca una vez publicado: es lo que
   *  compara "esto ya lo he leído", y moverlo le volvería a saltar el aviso a
   *  todo el equipo. */
  id: string;
  /** Hasta qué commit llega esta entrada. Lo usa `pnpm novedades` para saber
   *  desde dónde mirar la próxima vez; no se enseña en ningún sitio. */
  hasta: string | null;
  /** Fecha escrita a mano, y solo para las entradas ANTERIORES a que existiera
   *  este log: salieron antes de que nada las sellara, y su fecha se sacó del
   *  historial de cambios. Cuando está, manda sobre el sello del servidor —que
   *  si no las marcaría a todas con el día en que se estrenó esta versión.
   *
   *  Las nuevas NO la llevan: la pone el servidor al estrenarlas. */
  fecha?: string;
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

/** La marca que se guarda como "ya lo he leído": el id de la última entrada Y
 *  cuántos cambios traía.
 *
 *  El número hace falta desde que las entradas del mismo día se FUNDEN en una
 *  (ver scripts/novedades.mjs). Con solo el id, el segundo despliegue de la
 *  jornada no avisaba a nadie: la entrada seguía llamándose igual, así que para
 *  la campana no había cambiado nada aunque llevara cinco novedades más.
 *
 *  Formato `id·n`. El separador es un punto volado porque no aparece en un id
 *  (que es una fecha) y así partirlo no tiene vuelta de hoja. */
export const MARCA_ULTIMA: string | null = NOVEDADES[0]
  ? `${NOVEDADES[0].id}·${NOVEDADES[0].cambios.length}`
  : null;

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
 *  "no visto nada": es raro, y es mejor enseñar de más que tragarse el aviso.
 *
 *  ACEPTA LAS DOS FORMAS de marca: `id·n` (la de ahora) y el `id` a secas que
 *  quedó guardado en los navegadores de antes. Sin esa compatibilidad, el día
 *  del cambio todo el equipo se habría encontrado un aviso de "13 novedades"
 *  por algo que ya había leído. */
export function cuantasNuevas(
  visto: string | null,
  perfil: PerfilNovedades = "direccion",
  entradas: readonly Novedad[] = NOVEDADES,
): number {
  if (visto === null) return 0;
  const [id, n] = visto.split("·");
  const i = entradas.findIndex((x) => x.id === id);
  const anteriores = i < 0 ? entradas : entradas.slice(0, i);
  let cuantas = anteriores.filter((e) => e.cambios.some((c) => leAfecta(c, perfil))).length;
  // La marca cuenta TODOS los cambios, incluso los plegados. Solo después de
  // localizar las tandas sin leer se filtra: así reclasificar no mueve la marca.
  if (i >= 0 && n !== undefined && cambiosDeTandasSinLeer(entradas[i], Number(n)).some((c) => leAfecta(c, perfil))) cuantas++;
  return cuantas;
}

function cambiosDeTandasSinLeer(entrada: Novedad, leidos: number): Cambio[] {
  const tandas = [...new Set(entrada.cambios.map((c) => c.tanda ?? 1))].sort((a, b) => a - b);
  let antes = 0;
  const nuevos: Cambio[] = [];
  for (const t of tandas) {
    const suyos = entrada.cambios.filter((c) => (c.tanda ?? 1) === t);
    if (antes + suyos.length > leidos) nuevos.push(...suyos);
    antes += suyos.length;
  }
  return nuevos;
}

/** Los cambios que esta persona todavía no había leído, para pintarlos.
 *
 *  Pidió Iván (13/10/2026): con varios despliegues el mismo día, todos caen en
 *  la misma entrada y no se distinguía lo nuevo de lo que ya habías visto por
 *  la mañana.
 *
 *  Sale de la misma marca que la campana (`id·n`): la entrada que leíste y
 *  cuántos cambios tenía entonces. Las tandas se añaden siempre detrás, así que
 *  los `n` que viste son las primeras tandas enteras; lo de las tandas
 *  siguientes es lo nuevo. Las entradas de días que no llegaste a abrir se
 *  pintan enteras.
 *
 *  Sin marca, con la marca vieja sin número o con una entrada que ya no
 *  existe, no se pinta nada: sin saber qué leyó, pintar sería pintarlo todo,
 *  y eso no distingue nada. */
export function cambiosSinLeer(
  visto: string | null,
  entradas: readonly Novedad[] = NOVEDADES,
  perfil: PerfilNovedades = "direccion",
): ReadonlySet<Cambio> {
  const nuevos = new Set<Cambio>();
  if (visto === null) return nuevos;
  const [id, n] = visto.split("·");
  const i = entradas.findIndex((x) => x.id === id);
  if (i < 0 || n === undefined) return nuevos;

  for (const entrada of entradas.slice(0, i)) for (const c of entrada.cambios) if (leAfecta(c, perfil)) nuevos.add(c);
  for (const c of cambiosDeTandasSinLeer(entradas[i], Number(n))) if (leAfecta(c, perfil)) nuevos.add(c);
  return nuevos;
}

export const ETIQUETA: Record<TipoCambio, string> = {
  nuevo: "Nuevo",
  arreglado: "Arreglado",
  mejor: "Mejor",
};
