import { accionesDisponibles, type AccionDef, type AccionOF } from "./acciones";
import { ofsFichables, rolFichajeDe } from "./fichaje";
import { faseDePedido, type ConOFs, type Fase } from "./fases-tablero";
import type { OF, Rol } from "./types";

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
const PRIMARIA_POR_FASE: Record<Fase, AccionOF[]> = {
  sinEmpezar: ["empezar_planteo"],
  // Lo que toca con una devolución es ponerse con ella. Se deja detrás
  // "terminar_planteo" porque el pedido puede tener a la vez una OF devuelta y
  // otra en curso: si la devuelta ya se retomó (y por tanto es en_curso), la
  // fila sigue ofreciendo algo que hacer.
  devuelta: ["retomar", "terminar_planteo"],
  // "empezar_planteo" va al final: cubre la OF que "deshacer_empezar" devolvió
  // a pendiente conservando el tiempo ya fichado (faseDeOF la clasifica como
  // planteando por ese tiempo, aunque su estado real vuelva a ser pendiente).
  // Va después para que un en_curso siga ofreciendo terminar_planteo aunque
  // conviva con esa OF pendiente-con-tiempo.
  planteando: ["terminar_planteo", "empezar_planteo"],
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

/** OFs del pedido fichables como `rol`.
 *
 *  El motor de fichaje (lib/fichaje.ts) mantiene UN solo intervalo abierto con
 *  UN rol: no se puede fichar plantear y revisar a la vez con una sola
 *  llamada. Un pedido, en cambio, puede tener a la vez una OF en_curso (rol
 *  plantear) y otra por_revisar (rol revisar) — faseDePedido ya da por normal
 *  esa mezcla. Por eso el rol es un parámetro explícito y no algo que se
 *  infiera de "la primera OF fichable": mezclar los dos grupos en un mismo
 *  fichaje rompería la separación planteo/revisión de la que depende el
 *  historial.
 *
 *  La regla de qué es fichable vive en `ofsFichables` (lib/fichaje.ts); aquí
 *  solo se añade el filtro por rol. */
export function ofsFichablesDe(p: ConOFs, rol: Rol): OF[] {
  return ofsFichables(p).filter((o) => rolFichajeDe(o) === rol);
}
