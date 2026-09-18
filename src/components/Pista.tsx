"use client";

import { cloneElement, useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactElement } from "react";
import { createPortal } from "react-dom";

// ─── La pista de un botón ────────────────────────────────────────────────────
// El `title` del navegador tarda un segundo largo en salir, es un recuadro gris
// del sistema y con el teclado no sale nunca. En los botones de solo icono
// (↔ ↕ ↻ ⇄…) es lo ÚNICO que dice qué hace cada uno, y hay quien en el equipo
// no se acuerda: la pista sale casi al momento, con el nombre en grande y una
// línea de por qué o de qué pasa al pulsarlo.
//
// Envuelve el botón con una caja que no se maqueta (`display: contents`):
// una caja normal alrededor movía el botón dentro de su fila y rompía el
// `flex` del carril.
//
// Se pinta en un portal con `position: fixed`: así no la recorta ningún
// `overflow` de la ficha y queda por encima del visor de documentos (z-90).

/** Lo que se espera con el ratón quieto encima antes de sacarla. Lo justo
 *  para que no salten pistas al cruzar la barra camino de otra cosa. */
const ESPERA_MS = 200;
/** Si hace menos de esto que se cerró otra, la siguiente sale sin esperar:
 *  quien va de botón en botón leyendo no tiene que parar en cada uno. */
const SEGUIDAS_MS = 500;
/** Aire entre el botón y la pista, en px. */
const SEPARACION = 8;
/** Margen mínimo contra el borde de la ventana, en px. */
const BORDE = 8;

let ultimaCerrada = 0;

/** ¿Se cerró otra pista hace un momento? Entonces esta sale sin esperar. */
function vieneDeOtra(): boolean {
  return performance.now() - ultimaCerrada < SEGUIDAS_MS;
}

function apuntarCierre() {
  ultimaCerrada = performance.now();
}

type Lado = "derecha" | "abajo";

export function Pista({
  texto,
  detalle,
  lado = "derecha",
  children,
}: {
  /** El nombre del botón, en negrita. */
  texto: string;
  /** Una línea debajo: qué pasa al pulsarlo, o que se recuerda. */
  detalle?: string;
  /** Hacia dónde sale: a la derecha en un carril vertical, debajo en una barra. */
  lado?: Lado;
  children: ReactElement<HTMLAttributes<HTMLElement>>;
}) {
  const [ancla, setAncla] = useState<DOMRect | null>(null);
  const espera = useRef<number | undefined>(undefined);

  function abrir(el: Element | null, inmediata: boolean) {
    if (!el) return;
    window.clearTimeout(espera.current);
    const sacar = () => setAncla(el.getBoundingClientRect());
    if (inmediata || vieneDeOtra()) sacar();
    else espera.current = window.setTimeout(sacar, ESPERA_MS);
  }

  function cerrar() {
    window.clearTimeout(espera.current);
    setAncla((antes) => {
      if (antes) apuntarCierre();
      return null;
    });
  }

  useEffect(() => () => window.clearTimeout(espera.current), []);

  return (
    // `display: contents`: la caja no existe para la maquetación —el botón
    // sigue siendo hijo directo del `flex` del carril— pero sí recibe los
    // eventos del botón (entrar el ratón en un hijo es entrar en ella).
    <span
      className="contents"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") abrir(e.currentTarget.firstElementChild, false);
      }}
      onPointerLeave={cerrar}
      // Al pulsar se quita: ya se sabe qué hace, y taparía lo que cambia.
      onPointerDown={cerrar}
      // Con el teclado sale al llegar con Tab, sin esperar. Solo si el foco se
      // ve (`:focus-visible`): tras un clic el botón se queda con el foco y
      // la pista volvería a salir encima de lo que se acaba de cambiar.
      onFocus={(e) => {
        if (e.target.matches(":focus-visible")) abrir(e.target, true);
      }}
      onBlur={cerrar}
    >
      {/* La línea de explicación también para el lector de pantalla. El
          nombre ya lo da el `aria-label` de cada botón; el globo es visual y
          va oculto. */}
      {cloneElement(children, { "aria-description": detalle })}
      {ancla &&
        typeof document !== "undefined" &&
        createPortal(<Globo ancla={ancla} lado={lado} texto={texto} detalle={detalle} />, document.body)}
    </span>
  );
}

function Globo({ ancla, lado, texto, detalle }: { ancla: DOMRect; lado: Lado; texto: string; detalle?: string }) {
  const caja = useRef<HTMLDivElement>(null);
  // Se coloca antes de pintarse (layout effect): hay que medirla para que no
  // se salga de la ventana, y medida después se vería el salto.
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    let x: number;
    let y: number;
    if (lado === "derecha") {
      x = ancla.right + SEPARACION;
      y = ancla.top + ancla.height / 2 - height / 2;
    } else {
      x = ancla.left + ancla.width / 2 - width / 2;
      y = ancla.bottom + SEPARACION;
    }
    x = Math.min(Math.max(x, BORDE), window.innerWidth - width - BORDE);
    y = Math.min(Math.max(y, BORDE), window.innerHeight - height - BORDE);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.visibility = "visible";
  }, [ancla, lado]);

  return (
    <div
      ref={caja}
      aria-hidden="true"
      className={`pista pista-${lado} pointer-events-none fixed z-[100] max-w-64 rounded-lg px-2.5 py-1.5`}
      style={{ left: 0, top: 0, visibility: "hidden" }}
    >
      <p className="text-xs font-semibold leading-tight">{texto}</p>
      {detalle && <p className="mt-0.5 text-[11px] leading-snug opacity-70">{detalle}</p>}
    </div>
  );
}
