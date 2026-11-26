"use client";

import { useEffect, useState, type RefObject } from "react";

// ─── Medir para colocar ──────────────────────────────────────────────────────
// Las fechas de las líneas de tiempo se colocan pegadas a su punto, y para no
// pisarse hay que saber cuánto mide cada texto y cuánto la caja. Antes se
// suponía un ancho fijo en % y en una columna ancha las fechas acababan lejos
// de su punto sin hacer falta.

let lienzo: CanvasRenderingContext2D | null | undefined;
let familia: string | undefined;

/** Ancho en px de un texto con la letra de la app.
 *
 *  Con un `<canvas>` y no con un elemento oculto: no toca el DOM ni provoca
 *  reflujos, y se llama una vez por fecha y fila. En el servidor (o si no hay
 *  canvas) se estima: las fechas son dígitos y la cuenta sale muy parecida. */
export function anchoTexto(
  texto: string,
  { px = 10, peso = 400, espaciadoEm = 0 }: { px?: number; peso?: number; espaciadoEm?: number } = {},
): number {
  const extra = texto.length * espaciadoEm * px;
  if (typeof document === "undefined") return texto.length * px * 0.6 + extra;
  if (lienzo === undefined) lienzo = document.createElement("canvas").getContext("2d");
  if (!lienzo) return texto.length * px * 0.6 + extra;
  familia ??= getComputedStyle(document.body).fontFamily || "sans-serif";
  lienzo.font = `${peso} ${px}px ${familia}`;
  return lienzo.measureText(texto).width + extra;
}

/** Ancho real de un elemento, al día cuando cambia (ventana, columna…).
 *  `null` hasta que se monta: quien lo use pone un ancho de reserva. */
export function useAncho(ref: RefObject<HTMLElement | null>): number | null {
  const [ancho, setAncho] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return ancho;
}
