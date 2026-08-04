import { accionesDisponibles, type AccionDef, type AccionOF } from "./acciones";
import { esFichable } from "./fichaje";
import { faseDePedido, type ConOFs } from "./fases-tablero";
import type { OF } from "./types";

// ─── Qué acción ofrecer en la fila de un pedido ──────────────────────────────
// Un pedido tiene N OFs y cada una tiene sus acciones. La fila solo tiene sitio
// para UNA, así que se reduce a la primaria de la fase en la que está el pedido.
// Las demás siguen estando en el detalle.
//
// Las acciones NO se definen aquí: salen de accionesDisponibles(), que es la
// máquina de estados y la única fuente de verdad.

/** Acción primaria de cada fase. `null` = esa fase no tiene botón propio en la
 *  fila: "esperando revisión" es trabajo de otro, y "listo para pasar" tiene su
 *  propio botón de pasar el pedido entero. */
const PRIMARIA_POR_FASE: Record<string, AccionOF[]> = {
  sinEmpezar: ["empezar_planteo"],
  // Devuelta y en curso caen las dos en "planteando": si viene devuelta hay que
  // retomarla, y si ya está en curso lo que toca es mandarla a revisión.
  planteando: ["retomar", "terminar_planteo"],
  esperandoRevision: [],
  listoParaPasar: [],
};

/** OFs del pedido que admiten esa acción ahora mismo. */
export function ofsPara(p: ConOFs, accion: AccionOF): OF[] {
  return p.ofs.filter((o) => accionesDisponibles(o).some((a) => a.id === accion));
}

/** La acción que pinta la fila, o null si en esta fase no hay ninguna. */
export function accionPrimariaDePedido(p: ConOFs): AccionDef | null {
  if (p.ofs.length === 0) return null;
  const candidatas = PRIMARIA_POR_FASE[faseDePedido(p)] ?? [];
  for (const id of candidatas) {
    const ofs = ofsPara(p, id);
    if (ofs.length === 0) continue;
    const def = accionesDisponibles(ofs[0]).find((a) => a.id === id);
    if (def) return def;
  }
  return null;
}

/** OFs del pedido en las que se puede fichar. */
export function ofsFichablesDe(p: ConOFs): OF[] {
  return p.ofs.filter(esFichable);
}
