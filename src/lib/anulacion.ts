// ─── Por qué se anuló una OF ─────────────────────────────────────────────────
// Anular dice que Oficina Técnica no la hace, pero no POR QUÉ, y el porqué es
// justo lo que hace falta al repasarlas después: no es lo mismo "la hace el
// taller" que "se cayó el pedido entero". Al anular se elige la causa, y la
// causa se lee en el propio distintivo ("ANULADA · TALLER") sin abrir nada.
//
// Se guarda en `observacion`, el campo que ya viaja hasta la base local, en vez
// de abrir una columna nueva. Se puede porque los dos usos de ese campo son
// EXCLUYENTES: en una OF devuelta es la nota del revisor y en una anulada es
// esto, y el estado dice cuál de las dos es. La única pérdida es anular una OF
// devuelta, que pisa la nota de la devolución — y a esas alturas esa nota ya no
// manda a nadie a hacer nada.

export type CausaAnulacion = "taller" | "proveedor" | "pedido" | "otro";

export interface Anulacion {
  causa: CausaAnulacion;
  /** Obligatoria en "otro", que si no acaba siendo el cajón de todo. */
  nota?: string;
}

export const CAUSAS: readonly {
  id: CausaAnulacion;
  /** Para el botón al anular: la frase entera, como se diría. */
  label: string;
  /** Para el distintivo, que solo tiene sitio para una palabra. */
  corto: string;
  /** Si hace falta escribir algo. */
  pideNota?: boolean;
}[] = [
  { id: "taller", label: "La hace el taller", corto: "Taller" },
  // Lacado, vinilo, portes… sale en las compras de la OF y no es lo mismo que
  // hacerlo el taller de casa.
  { id: "proveedor", label: "La hace un proveedor", corto: "Proveedor" },
  { id: "pedido", label: "Se anuló el pedido entero", corto: "Pedido anulado" },
  { id: "otro", label: "Otro motivo", corto: "Otro", pideNota: true },
];

const POR_ID = new Map(CAUSAS.map((c) => [c.id, c]));

/** La causa, empaquetada para viajar en `observacion`. */
export function codificarAnulacion(a: Anulacion): string {
  const nota = a.nota?.trim();
  return nota ? `${a.causa}: ${nota}` : a.causa;
}

/** Lo contrario. `null` si el texto no es una anulación con causa: pasa con las
 *  OF anuladas ANTES de que esto existiera, que no tienen ninguna. */
export function leerAnulacion(observacion: string | null | undefined): Anulacion | null {
  const texto = (observacion ?? "").trim();
  if (!texto) return null;
  const corte = texto.indexOf(":");
  const causa = (corte >= 0 ? texto.slice(0, corte) : texto).trim() as CausaAnulacion;
  if (!POR_ID.has(causa)) return null;
  const nota = corte >= 0 ? texto.slice(corte + 1).trim() : "";
  return nota ? { causa, nota } : { causa };
}

/** Cómo se lee la causa en el distintivo. Con la nota cuando es "otro", que sin
 *  ella no dice nada. */
export function textoAnulacion(a: Anulacion): string {
  const meta = POR_ID.get(a.causa);
  if (!meta) return a.causa;
  return a.causa === "otro" && a.nota ? a.nota : meta.corto;
}

/** ¿Se puede anular con esto? "Otro" sin explicación no vale. */
export function anulacionCompleta(a: Anulacion): boolean {
  return POR_ID.get(a.causa)?.pideNota ? Boolean(a.nota?.trim()) : true;
}
