import { claveDeCausa } from "./devolucion";

// ─── Qué mirar al revisar ────────────────────────────────────────────────────
// Los ocho puntos que Ángel repasa en una lona, dictados por él el 02/09/2026.
//
// SON LA MISMA LISTA que las causas de devolución, vista del derecho. Él las
// pasó en positivo —lo que comprueba— y en `causasDeAngel` (estado-db.ts) están
// en negativo, porque al devolver se marca lo que falló. Aquí van del derecho
// otra vez, que es como se usan mientras se revisa: "Medidas de la lona" es lo
// que miras; "Medidas de la lona mal" es lo que apuntas si no cuadra.
//
// El vínculo entre las dos caras es la ETIQUETA de la causa, comparada por su
// clave normalizada. No es un id porque los ids los pone la base al sembrar y
// no son los mismos en desarrollo que en el servidor. Si alguien retira o
// renombra una causa, el punto se queda sin atajo y la guía sigue sirviendo:
// no se rompe nada, solo deja de preseleccionar.
//
// SON DE LONAS (lona, aumentos, simetría, corte). Para toldos o camiones harán
// falta otros, y cuando Ángel los dicte se añaden aquí y en las causas.

export interface PuntoGuia {
  id: string;
  /** Lo que se comprueba, en positivo. Es lo que se lee mientras se revisa. */
  mira: string;
  /** La causa que se marca si ese punto falla, tal cual está sembrada. */
  causa: string;
}

export const GUIA_REVISION: readonly PuntoGuia[] = [
  { id: "medidas-lona", mira: "Medidas de la lona hecha", causa: "Medidas de la lona mal" },
  { id: "medidas-aumentos", mira: "Medidas de los aumentos", causa: "Medidas de los aumentos mal" },
  { id: "tipo-lona", mira: "Tipo de lona", causa: "Tipo de lona equivocado" },
  {
    id: "anotaciones-material",
    mira: "Anotaciones de materiales",
    causa: "Faltan anotaciones de material",
  },
  { id: "elementos", mira: "Están todos los elementos", causa: "Faltan elementos" },
  { id: "piezas-corte", mira: "Todas las piezas en el corte", causa: "Faltan piezas en el corte" },
  {
    id: "medidas-corte",
    mira: "Las medidas de corte corresponden",
    causa: "Medidas de corte no corresponden",
  },
  { id: "simetria", mira: "Simetría hecha, si hace falta", causa: "Falta la simetría" },
];

/** Cómo está cada punto para quien revisa.
 *
 *  Tres estados y no dos: "sin mirar" no es lo mismo que "bien". Con una
 *  casilla sola, un punto sin marcar diría a la vez "todavía no he llegado" y
 *  "lo he mirado y falla", que son las dos cosas que hay que distinguir para
 *  saber si queda trabajo. */
export type EstadoPunto = "sin_mirar" | "bien" | "falla";

/** Las causas que hay que llevar a la devolución, según lo marcado.
 *
 *  Devuelve ETIQUETAS y no ids: quien las pinta las resuelve contra la lista
 *  viva de causas (ver `idsDeCausas`), que es la que sabe los ids de esta
 *  instalación. */
export function causasDeLoQueFalla(marcas: Readonly<Record<string, EstadoPunto>>): string[] {
  return GUIA_REVISION.filter((p) => marcas[p.id] === "falla").map((p) => p.causa);
}

/** Los ids de esas causas dentro de la lista que hoy se ofrece.
 *
 *  Las que no estén —retiradas, o renombradas por alguien— se caen sin ruido:
 *  el revisor verá el cuadro de devolver con una causa menos marcada, que es
 *  mejor que un error por algo que él no ha hecho. */
export function idsDeCausas(
  etiquetas: readonly string[],
  causas: ReadonlyArray<{ id: number; etiqueta: string }>,
): number[] {
  const porClave = new Map(causas.map((c) => [claveDeCausa(c.etiqueta), c.id]));
  return etiquetas.map((e) => porClave.get(claveDeCausa(e))).filter((id): id is number => id !== undefined);
}

/** Cuántos puntos quedan por mirar. Es lo que decide si se puede aprobar con
 *  tranquilidad o si la revisión se quedó a medias. */
export function sinMirar(marcas: Readonly<Record<string, EstadoPunto>>): number {
  return GUIA_REVISION.filter((p) => (marcas[p.id] ?? "sin_mirar") === "sin_mirar").length;
}
