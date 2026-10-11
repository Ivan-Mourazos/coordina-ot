import { claveDeCausa } from "./devolucion";

// ─── Qué mirar al revisar ────────────────────────────────────────────────────
// Los pasos que se repasan antes de dar un trabajo por bueno. Los primeros los
// dictó Ángel el 02/09/2026 para las lonas; desde entonces se editan desde la
// propia web (menú → Pasos y causas de revisión), sin pasar por un despliegue.
//
// NO HAY LISTA EN EL CÓDIGO: la mantienen los técnicos. Desde el 11/10/2026 los
// pasos van en su propia tabla y las causas se quedan en unas pocas globales.
// Antes cada causa era a la vez un paso (su cara en positivo) y eso obligaba a
// tener tantas causas como cosas que mirar: la lista creció a trece, nadie las
// marcaba y el 77 % de las devoluciones se iba sin causa. Ahora muchos pasos
// apuntan a una misma causa — "la salida del toldo" y "el frente" fallan los
// dos como Medidas —, y lo que se cuenta sigue siendo pequeño y legible.
//
// COMUNES Y POR FAMILIA. Un paso sin familia vale para todos los pedidos; con
// familia, solo sale en los trabajos de esa. Así el que revisa una funda no
// tiene delante ocho pasos sobre aumentos y simetría de lona.

/** Tope del texto de un paso: cabe en una línea de la guía. */
export const PASO_MAX = 120;

/** Un paso de la guía tal como se pinta. Subconjunto a propósito: no arrastra
 *  el tipo del servidor ni el del cliente, y sirve para los dos. */
export interface PuntoGuia {
  id: number;
  /** Lo que se comprueba, en positivo. */
  mira: string;
  /** La causa que se marca al devolver si este paso falla. */
  causaId: number;
  /** El nombre de esa causa, para enseñarlo cuando el paso falla. */
  etiqueta: string;
  familia: string | null;
}

interface PasoParaGuia {
  id: number;
  texto: string;
  familia: string | null;
  causaId: number;
  retirado?: boolean;
}

interface CausaParaGuia {
  id: number;
  etiqueta: string;
}

/** Los pasos que hay que repasar en un trabajo de estas familias.
 *
 *  Una OF tiene una familia; un pedido puede traer varias (un toldo y su lona),
 *  y entonces se repasan los de todas — el revisor está mirando las dos cosas.
 *
 *  Los comunes van primero: valen para cualquier trabajo, y empezar por ellos
 *  es el orden en que se revisa. Los retirados no entran: se retiran
 *  precisamente para dejar de pedirlos. Un paso cuya causa no se encuentra
 *  sale igual, con la causa sin nombre: mejor revisarlo que perderlo. */
export function guiaDeFamilias(
  pasos: readonly PasoParaGuia[],
  causas: readonly CausaParaGuia[],
  familias: readonly string[],
): PuntoGuia[] {
  const suyas = new Set(familias.map((f) => f.toUpperCase()));
  const nombre = new Map(causas.map((c) => [c.id, c.etiqueta]));
  const vale = pasos.filter(
    (p) => !p.retirado && (p.familia === null || suyas.has(p.familia.toUpperCase())),
  );
  return [...vale.filter((p) => p.familia === null), ...vale.filter((p) => p.familia !== null)].map(
    (p) => ({
      id: p.id,
      mira: p.texto,
      causaId: p.causaId,
      etiqueta: nombre.get(p.causaId) ?? p.texto,
      familia: p.familia,
    }),
  );
}

/** Cómo está cada paso para quien revisa.
 *
 *  Tres estados y no dos: "sin mirar" no es lo mismo que "bien". Con una
 *  casilla sola, un paso sin marcar diría a la vez "todavía no he llegado" y
 *  "lo he mirado y falla", que son las dos cosas que hay que distinguir para
 *  saber si queda trabajo. */
export type EstadoPunto = "sin_mirar" | "bien" | "falla";

/** Las causas que hay que llevar marcadas a la devolución.
 *
 *  Sin repetir: dos pasos que fallan por Medidas son UNA causa marcada, que
 *  es lo que se cuenta luego. En el orden en que aparecen en la guía. */
export function causasDeLoQueFalla(
  puntos: readonly PuntoGuia[],
  marcas: Readonly<Record<number, EstadoPunto>>,
): number[] {
  return [...new Set(puntos.filter((p) => marcas[p.id] === "falla").map((p) => p.causaId))];
}

/** Cuántos pasos quedan por mirar. Es lo que decide si se puede aprobar con
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
