"use client";

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

// ─── Tarjeta flotante de resumen para filas estrechas ────────────────────────
// En columnas cortas (≤ 30rem) las filas del tablero se mantienen en una sola
// línea y van cediendo datos (cliente, nombre de familia, fechas, minutos…).
// Al dejar el ratón quieto encima (o llegar con teclado) 400 ms, esta tarjeta
// asoma debajo con el resumen completo, sin mover la fila ni la columna.
//
// Usa `popover="hint"` en un portal al `body` (como `Pista.tsx`): sube a la
// capa superior del navegador para que ningún `overflow` la recorte, lleva
// `pointer-events-none` para no tapar clics en la fila de debajo y el navegador
// coordina automáticamente que no se apile con otros `hint`.

/** Espera antes de abrir: evita que salten tarjetas al barrer la columna con el ratón. */
export const RETARDO_RESUMEN_MS = 400;
/** Mismo umbral que `@max-[30rem]` en PedidoLinea y LineaRevisar. */
const UMBRAL_ESTRECHO_REM = 30;
/** Separación vertical entre la fila y la tarjeta, en px. */
const SEPARACION_PX = 6;
/** Margen mínimo contra los bordes de la ventana, en px. */
const BORDE_PX = 8;

/** Comprueba si el interior de la fila (`@container`) está en el tramo estrecho
 *  (< 30rem), donde la fila ya oculta cliente u otros datos. En ancho (> 30rem)
 *  ya se ve todo y la tarjeta no debe salir. */
export function esFilaEstrecha(fila: HTMLElement): boolean {
  const cs = getComputedStyle(fila);
  const anchoInterior = fila.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const raizPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  // `<` y no `<=`: `@max-[30rem]` es `width < 30rem`; justo en 30rem la fila
  // ya va en ancho y no hay nada que enseñar.
  return anchoInterior < UMBRAL_ESTRECHO_REM * raizPx;
}

/** Gestiona la apertura diferida (ratón y teclado) de `ResumenFila`. */
export function useResumenFila({ desactivado = false }: { desactivado?: boolean } = {}) {
  const [ancla, setAncla] = useState<DOMRect | null>(null);
  const espera = useRef<number | undefined>(undefined);

  const cancelar = useCallback(() => {
    window.clearTimeout(espera.current);
    espera.current = undefined;
  }, []);

  const cerrar = useCallback(() => {
    cancelar();
    setAncla(null);
  }, [cancelar]);

  const programar = (fila: HTMLElement) => {
    if (desactivado) return;
    cancelar();
    espera.current = window.setTimeout(() => {
      espera.current = undefined;
      if (!fila.isConnected || !esFilaEstrecha(fila)) return;
      setAncla(fila.getBoundingClientRect());
    }, RETARDO_RESUMEN_MS);
  };

  useEffect(() => {
    if (!desactivado) return;
    cancelar();
    const id = window.setTimeout(() => setAncla(null), 0);
    return () => window.clearTimeout(id);
  }, [desactivado, cancelar]);

  useEffect(() => () => cancelar(), [cancelar]);

  // Al desplazarse o cambiar el tamaño de ventana se cierra para no quedar
  // descolgada de su fila.
  useEffect(() => {
    if (!ancla) return;
    const fuera = () => cerrar();
    window.addEventListener("scroll", fuera, true);
    window.addEventListener("resize", fuera);
    window.addEventListener("blur", fuera);
    return () => {
      window.removeEventListener("scroll", fuera, true);
      window.removeEventListener("resize", fuera);
      window.removeEventListener("blur", fuera);
    };
  }, [ancla, cerrar]);

  const handlers = {
    onPointerEnter: (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "mouse" || desactivado) return;
      programar(e.currentTarget);
    },
    onPointerLeave: () => cerrar(),
    // Al pulsar se cierra al momento para no quedar sobre el selector o la ficha.
    onPointerDown: () => cerrar(),
    onFocus: (e: FocusEvent<HTMLDivElement>) => {
      if (desactivado) return;
      // Solo con foco visible de teclado (Tab), no al hacer clic con el ratón.
      if (!(e.target instanceof HTMLElement) || !e.target.matches(":focus-visible")) return;
      if (ancla) return;
      programar(e.currentTarget);
    },
    onBlur: (e: FocusEvent<HTMLDivElement>) => {
      // Si el foco se mueve a otro botón de la MISMA fila, no se cierra.
      if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
      cerrar();
    },
  };

  return { ancla, cerrar, handlers };
}

/** Tarjeta flotante (estilo HeroUI) superpuesta debajo de una fila estrecha. */
export function ResumenFila({
  ancla,
  onCerrado,
  children,
}: {
  ancla: DOMRect | null;
  onCerrado: () => void;
  children: ReactNode;
}) {
  if (!ancla || typeof document === "undefined") return null;
  return createPortal(
    <TarjetaResumen ancla={ancla} onCerrado={onCerrado}>
      {children}
    </TarjetaResumen>,
    document.body,
  );
}

function TarjetaResumen({
  ancla,
  onCerrado,
  children,
}: {
  ancla: DOMRect;
  onCerrado: () => void;
  children: ReactNode;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const alCerrar = useEffectEvent(onCerrado);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const cerrado = (e: Event) => {
      if ((e as ToggleEvent).newState === "closed") alCerrar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && el.matches(":popover-open")) {
        e.preventDefault();
        el.hidePopover();
      }
    };
    el.addEventListener("toggle", cerrado);
    const sinHint = el.popover !== "hint";
    if (sinHint) document.addEventListener("keydown", tecla, true);
    return () => {
      el.removeEventListener("toggle", cerrado);
      if (sinHint) document.removeEventListener("keydown", tecla, true);
    };
  }, []);

  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    if (el.matches(":popover-open")) {
      colocar(el);
      return;
    }
    try {
      el.showPopover();
      colocar(el);
      return;
    } catch {
      // Si otro popover se está abriendo en este mismo instante, reintentar en
      // el siguiente fotograma (mismo resguardo que `Pista.tsx`).
    }
    const pendiente = requestAnimationFrame(() => {
      if (!el.isConnected || el.matches(":popover-open")) return;
      try {
        el.showPopover();
        colocar(el);
      } catch {
        // Sin tarjeta esta vez.
      }
    });
    return () => cancelAnimationFrame(pendiente);

    function colocar(el: HTMLElement) {
      const anchoMax = Math.min(340, window.innerWidth - BORDE_PX * 2);
      el.style.minWidth = `${Math.min(ancla.width, anchoMax)}px`;
      el.style.maxWidth = `${anchoMax}px`;
      const { width, height } = el.getBoundingClientRect();
      const x = Math.min(Math.max(ancla.left, BORDE_PX), window.innerWidth - width - BORDE_PX);
      const cabeAbajo = ancla.bottom + SEPARACION_PX + height <= window.innerHeight - BORDE_PX;
      const y = cabeAbajo
        ? ancla.bottom + SEPARACION_PX
        : Math.max(BORDE_PX, ancla.top - height - SEPARACION_PX);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.visibility = "visible";
    }
  }, [ancla]);

  return (
    <div
      ref={caja}
      data-resumen-fila=""
      popover="hint"
      aria-hidden="true"
      // Sin `display` propio: una clase `flex` aquí ganaba a la regla del
      // navegador que esconde el popover cerrado, y la tarjeta podía verse un
      // fotograma tras cerrarse (revisión del 27/11/2026). El flex va dentro.
      className="pointer-events-none inset-auto m-0 rounded-xl border-0 bg-surface px-3 py-2.5 text-[11px] text-text"
      style={{
        left: 0,
        top: 0,
        visibility: "hidden",
        boxShadow: "var(--hero-sombra-panel), 0 12px 30px -12px rgba(0, 0, 0, 0.28)",
      }}
    >
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

/** Una línea de la tarjeta: etiqueta discreta a la izquierda y el dato a la
 *  derecha, todas alineadas en dos columnas. Iván (27/11/2026) la quería
 *  «ordenada, legible y con buen diseño»: la primera versión mezclaba chips,
 *  fechas y nombres en un mismo renglón y había que buscar cada cosa. Así se
 *  lee de arriba abajo, siempre en el mismo orden. Va dentro de
 *  `<DatosResumen>`. */
export function DatoResumen({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[10px] leading-5 text-text-muted">{etiqueta}</dt>
      <dd className="m-0 flex min-w-0 flex-wrap items-center gap-x-1.5 leading-5 text-text">{children}</dd>
    </>
  );
}

/** La rejilla de `DatoResumen`: el cliente va encima, como título. */
export function DatosResumen({ titulo, children }: { titulo?: ReactNode; children: ReactNode }) {
  return (
    <>
      {titulo && <p className="text-[12px] font-semibold leading-snug text-text">{titulo}</p>}
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 tabular-nums">{children}</dl>
    </>
  );
}
