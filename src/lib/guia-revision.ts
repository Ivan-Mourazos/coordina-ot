import { claveDeCausa } from "./devolucion";

// ─── Qué mirar al revisar ────────────────────────────────────────────────────
// Los puntos que se repasan antes de dar un trabajo por bueno. Los primeros los
// dictó Ángel el 02/09/2026 para las lonas; desde entonces se editan desde la
// propia web (menú → Causas y guía de revisión), sin pasar por un despliegue.
//
// NO HAY LISTA EN EL CÓDIGO, y es el punto: la guía son las CAUSAS DE
// DEVOLUCIÓN vistas del derecho. Cada causa guarda su cara en positivo
// (`mira`), así que "Medidas de la lona hecha" y "Medidas de la lona mal" son
// la misma fila. En dos sitios se descuadraban: alguien afinaba la causa, la
// guía seguía diciendo lo de antes, y lo que marcabas al revisar dejaba de ser
// lo que se apuntaba al devolver.
//
// POR FAMILIA. Una causa sin familia vale para todo; con familia, solo sale en
// los trabajos de esa. Así el que revisa una funda no tiene delante ocho puntos
// sobre aumentos y simetría de lona.

/** Lo que hace falta de una causa para pintar la guía. Es un subconjunto de
 *  `CausaDevolucion` a propósito: así esto no arrastra el tipo del servidor ni
 *  el del cliente, y sirve para los dos. */
export interface PuntoGuia {
  id: number;
  /** Lo que se comprueba, en positivo. */
  mira: string;
  /** Lo que se marca si ese punto falla. */
  etiqueta: string;
  familia: string | null;
}

interface CausaParaGuia {
  id: number;
  etiqueta: string;
  familia: string | null;
  mira: string | null;
  retirada?: boolean;
}

/** Los puntos que hay que repasar en un trabajo de estas familias.
 *
 *  Una OF tiene una familia; un pedido puede traer varias (un toldo y su lona),
 *  y entonces se repasan las de todas — el revisor está mirando las dos cosas.
 *
 *  Las genéricas van primero: son las que valen para cualquier trabajo, y
 *  empezar por ellas es el orden en que se revisa. Las retiradas no entran: se
 *  retiran precisamente para dejar de pedirlas. */
export function guiaDeFamilias(
  causas: readonly CausaParaGuia[],
  familias: readonly string[],
): PuntoGuia[] {
  const suyas = new Set(familias.map((f) => f.toUpperCase()));
  return causas
    .filter((c) => !c.retirada && c.mira)
    .filter((c) => c.familia === null || suyas.has(c.familia.toUpperCase()))
    .map((c) => ({ id: c.id, mira: c.mira!, etiqueta: c.etiqueta, familia: c.familia }));
}

/** Cómo está cada punto para quien revisa.
 *
 *  Tres estados y no dos: "sin mirar" no es lo mismo que "bien". Con una
 *  casilla sola, un punto sin marcar diría a la vez "todavía no he llegado" y
 *  "lo he mirado y falla", que son las dos cosas que hay que distinguir para
 *  saber si queda trabajo. */
export type EstadoPunto = "sin_mirar" | "bien" | "falla";

/** Los ids de las causas que hay que llevar marcadas a la devolución.
 *
 *  Ids y no etiquetas: ahora los puntos vienen de la misma tabla que las
 *  causas, así que ya se sabe cuál es cada una y no hay nada que resolver. */
export function causasDeLoQueFalla(
  puntos: readonly PuntoGuia[],
  marcas: Readonly<Record<number, EstadoPunto>>,
): number[] {
  return puntos.filter((p) => marcas[p.id] === "falla").map((p) => p.id);
}

/** Cuántos puntos quedan por mirar. Es lo que decide si se puede aprobar con
 *  tranquilidad o si la revisión se quedó a medias. */
export function sinMirar(
  puntos: readonly PuntoGuia[],
  marcas: Readonly<Record<number, EstadoPunto>>,
): number {
  return puntos.filter((p) => (marcas[p.id] ?? "sin_mirar") === "sin_mirar").length;
}

/** ¿Dice ya lo mismo que otra? Lo usa la pantalla de edición para avisar ANTES
 *  de guardar, en vez de dejar que el servidor conteste con un choque. */
export function yaExiste(
  etiqueta: string,
  causas: readonly { id: number; etiqueta: string }[],
  exceptoId?: number,
): boolean {
  const clave = claveDeCausa(etiqueta);
  return causas.some((c) => c.id !== exceptoId && claveDeCausa(c.etiqueta) === clave);
}
