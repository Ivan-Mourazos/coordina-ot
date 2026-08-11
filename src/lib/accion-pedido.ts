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
// "empezar_planteo" y "retomar" ya NO salen aquí: las hace el botón del reloj.
// Las dos arrancan el fichaje (`efectoFichaje: "arranca"`), así que al lado de
// un botón "Fichar" eran dos botones para lo mismo — y encima uno de ellos,
// "Reanudar", aparecía junto a "Empezar planteo" en el mismo pedido. Ahora hay
// un solo camino: fichar empieza (o retoma) el planteo, y a partir de ahí solo
// quedan pausar, reanudar y pasar a revisión.
const PRIMARIA_POR_FASE: Record<Fase, AccionOF[]> = {
  sinEmpezar: [],
  devuelta: ["terminar_planteo"],
  planteando: ["terminar_planteo"],
  esperandoRevision: [],
  listoParaPasar: [],
};

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
