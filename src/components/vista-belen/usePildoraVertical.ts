"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

// ─── La píldora que se desliza, en una lista de arriba abajo ─────────────────
// Iván, 16/11/2026: «que el efecto del header se haga aquí también». La de las
// tiras (PildorasDeslizantes) solo mira los hijos directos de una tira en
// fila; la columna de listas de Belén va por grupos, así que la elegida se
// busca dentro del contenedor (`[aria-current="page"]`) y se mide con
// offsetTop, que no ve los `transform`: mientras las vecinas se apartan al
// reordenar (FLIP), la píldora ya va directa a su sitio final.

const ELEGIDA = '[aria-current="page"]';

const quieto = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Caja ={ x: number; y: number; w: number; h: number };

/** Posición de `el` respecto a `contenedor`, sumando offsets hasta llegar a él. */
function medir(el: HTMLElement, contenedor: HTMLElement): Caja | null {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== contenedor) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  if (n !== contenedor || !el.offsetWidth) return null;
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/** `clave` cambia cuando cambia la elegida o el orden. Devuelve el ref del
 *  contenedor (debe tener posición propia) y el estilo de la píldora; `null`
 *  mientras no hay nada que señalar. */
export function usePildoraVertical<T extends HTMLElement>(clave: string) {
  const contenedor = useRef<T>(null);
  const [caja, setCaja] = useState<Caja | null>(null);
  // La primera vez aparece en su sitio; desde ahí se desliza.
  const [lista, setLista] = useState(false);

  useLayoutEffect(() => {
    const c = contenedor.current;
    if (!c) return;
    const colocar = () => {
      const el = c.querySelector<HTMLElement>(ELEGIDA);
      const nueva = el ? medir(el, c) : null;
      setCaja((v) => (v && nueva && v.x === nueva.x && v.y === nueva.y && v.w === nueva.w && v.h === nueva.h ? v : nueva));
    };
    colocar();
    const r = new ResizeObserver(colocar);
    r.observe(c);
    return () => r.disconnect();
  }, [clave]);

  useLayoutEffect(() => {
    if (!caja || lista) return;
    const id = requestAnimationFrame(() => setLista(true));
    return () => cancelAnimationFrame(id);
  }, [caja, lista]);

  const estilo: CSSProperties | null = caja
    ? {
        width: caja.w,
        height: caja.h,
        transform: `translate(${caja.x}px, ${caja.y}px)`,
        // Con «reducir movimiento» salta sin deslizarse.
        transition: lista && !quieto() ?"transform 200ms cubic-bezier(.2,.8,.2,1), width 200ms ease, height 200ms ease" : "none",
      }
    : null;

  return { contenedor, estilo };
}
