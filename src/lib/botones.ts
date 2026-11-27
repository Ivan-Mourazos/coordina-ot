// ─── Los botones de acción sobre OF ──────────────────────────────────────────
// Un solo sitio para el tamaño y el color de los botones de fichar, revisar y
// pasar (comité y maquetas del 26/11/2026, aprobadas por Iván). Antes cada
// pantalla tenía los suyos —10, 11 y 12 px, «Pasar» en cian aquí y verde
// azulado allá— y el mismo gesto se veía distinto según dónde estuvieras.
//
// Sin iconos en el texto (⏱ ▶ ⏸): la guía de estilo no quiere adornos en los
// botones, y el color ya dice el rol (Iván, 26/11/2026).

/** Solo el TAMAÑO de los botones de la ficha (sin relieve): para los que
 *  llevan `chip-3d` u otro relieve propio. */
export const TAMANO_BLOQUE =
  "inline-flex h-6 min-w-[84px] items-center justify-center gap-1 rounded-[7px] px-2 text-[11px] font-semibold whitespace-nowrap";

/** Barra de la ficha, cada OF y Revisiones: todos iguales, 24 px. */
export const BOTON_BLOQUE = `boton-3d ${TAMANO_BLOQUE}`;

/** En las filas del tablero, un punto más bajo (22 px): la fila mide 30. Sin
 *  `display`: lo pone quien lo usa (`inline-flex` fijo o `AL_PASAR`). */
export const BOTON_FILA =
  "boton-3d h-[22px] min-w-[74px] shrink-0 items-center justify-center gap-1 rounded-[7px] px-2 text-[11px] font-semibold whitespace-nowrap";

/** Solo al pasar el ratón por la fila (o al llegar con Tab). Fuera del flujo
 *  mientras no se ve: así en reposo el cliente tiene todo su sitio. */
// Foco VISIBLE y no `focus-within`: al cerrar la ficha, el navegador devuelve
// el foco al código de la fila que se pulsó con el ratón, y con `focus-within`
// esa fila se quedaba con los botones fuera y sus datos escondidos sin el
// ratón encima (revisión del 27/11/2026).
export const AL_PASAR = "hidden group-hover:inline-flex group-has-[:focus-visible]:inline-flex";

/** «Pasar a revisión»: morado con borde, secundario junto al verde de fichar.
 *  `outline` y no `ring`: el relieve de `boton-3d` es un box-shadow y se comía
 *  el anillo. */
export const BOTON_PASAR_REVISION =
  "bg-surface text-violet-700 outline-[1.5px] outline-offset-[-1.5px] outline-violet-600 hover:bg-violet-50 dark:text-violet-300 dark:outline-violet-500 dark:hover:bg-violet-950/40";

/** Aprobar, Pasar a Producción, Impreso: el final del camino. */
export const BOTON_CIERRE = "bg-teal-700 text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40";

/** Coger, Devolver: neutros. */
export const BOTON_NEUTRO = "chip-3d text-text disabled:cursor-not-allowed disabled:opacity-40";
