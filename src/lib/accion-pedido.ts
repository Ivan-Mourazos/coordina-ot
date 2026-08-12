import { accionesDisponibles, type AccionOF } from "./acciones";
import { ofsFichables, rolFichajeDe } from "./fichaje";
import type { ConOFs } from "./fases-tablero";
import type { OF, Rol } from "./types";

// ─── Qué se puede hacer con un pedido desde la fila ──────────────────────────
// Un pedido tiene N OFs y cada una tiene sus acciones. La fila del tablero solo
// ofrece las del RELOJ —fichar, reanudar, pausar— y, cuando ya no queda nada,
// pasar el pedido. Todo lo demás vive en el detalle.
//
// Hubo una "acción primaria por fase" que ponía además "Pasar a revisión" en la
// fila. Se quitó: es la acción que hay que pensar (obliga a nombrar revisor, y
// lo hacía en un selector metido en la propia fila) y no la que se pulsa de
// pasada. Con ella fuera, la fila tiene UN botón y siempre en el mismo sitio.
//
// Las acciones NO se definen aquí: salen de accionesDisponibles(), que es la
// máquina de estados y la única fuente de verdad.

/** La acción que hay que ejecutar al fichar en esta OF, si además de arrancar
 *  el reloj hay que moverla de estado.
 *
 *  Es el otro lado de lo de arriba: el botón de fichar no solo ficha, también
 *  saca la OF de "sin empezar" (o la rescata de "devuelta"). Así "empezar a
 *  trabajar" es un gesto y no dos. */
export function accionAlFichar(of: OF): AccionOF | null {
  if (of.estado === "pendiente") return "empezar_planteo";
  if (of.estado === "devuelta") return "retomar";
  return null;
}

/** OFs del pedido que admiten esa acción ahora mismo. */
export function ofsPara(p: ConOFs, accion: AccionOF): OF[] {
  return p.ofs.filter((o) => accionesDisponibles(o).some((a) => a.id === accion));
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
