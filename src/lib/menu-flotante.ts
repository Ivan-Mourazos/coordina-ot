// ─── Dónde pintar un menú que cuelga de un botón ─────────────────────────────
// Los desplegables del tablero se pintan en un portal (ver la cabecera de
// Select.tsx: dentro del flujo los recorta cualquier ancestro con `overflow` y
// contra el borde de la ventana se salen). En un portal hay que decirles dónde
// ponerse, y eso es esta cuenta: la misma para todos, en un sitio, porque cada
// menú que la reimplementaba se salía de la pantalla por su cuenta.

/** Margen mínimo con los bordes de la ventana. */
export const MARGEN = 8;

export interface Ventana {
  ancho: number;
  alto: number;
}

export interface SitioMenu {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  minWidth: number;
  maxWidth: number;
}

/** Posición fija del menú a partir del rectángulo del botón.
 *
 *  Se ancla por un lado —izquierda, o derecha si `alignRight`— en vez de
 *  calcular el ancho del menú, que no se sabe hasta pintarlo: así el borde
 *  anclado queda sujeto a la ventana sin adivinar nada, y el otro lo limita
 *  `maxWidth`. Y si abajo no cabe, abre hacia arriba. */
export function sitioDeMenu(
  caja: { left: number; right: number; top: number; bottom: number; width: number },
  opts: { ventana: Ventana; alto: number; alignRight?: boolean },
): SitioMenu {
  const { ventana, alto, alignRight = false } = opts;
  const cabeAbajo = caja.bottom + 4 + alto <= ventana.alto - MARGEN;
  return {
    ...(alignRight
      ? // Sujeto también por la izquierda: anclar solo por la derecha dejaba el
        // menú saliéndose por el otro lado cuando el botón estaba pegado al
        // borde izquierdo (el "Asignar" de la bandeja, en pantalla estrecha).
        { right: Math.min(Math.max(MARGEN, ventana.ancho - caja.right), ventana.ancho - MARGEN) }
      : { left: Math.min(Math.max(MARGEN, caja.left), ventana.ancho - MARGEN) }),
    ...(cabeAbajo ? { top: caja.bottom + 4 } : { bottom: ventana.alto - caja.top + 4 }),
    minWidth: caja.width,
    maxWidth: ventana.ancho - 2 * MARGEN,
  };
}

/** La ventana actual. Fuera del navegador (render en servidor) no hay tal cosa,
 *  y el menú no se pinta hasta que lo abre alguien. */
export function ventanaActual(): Ventana | null {
  if (typeof window === "undefined") return null;
  return { ancho: window.innerWidth, alto: window.innerHeight };
}
