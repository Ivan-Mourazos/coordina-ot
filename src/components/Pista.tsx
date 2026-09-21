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

function Globo({ ancla, lado, texto, detalle }: { ancla: DOMRect; lado: Lado; texto?: string; detalle?: string }) {
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
      className={`pista pista-${lado} pointer-events-none fixed z-[100] max-w-72 rounded-lg px-2.5 py-1.5`}
      style={{ left: 0, top: 0, visibility: "hidden" }}
    >
      {texto && <p className="text-xs font-semibold leading-tight">{texto}</p>}
      {/* Sin `texto` (lo que viene de un `title`): una sola línea de lectura, a
          opacidad entera y respetando los saltos que traiga. */}
      {detalle && (
        <p className={`whitespace-pre-line text-[11px] leading-snug ${texto ? "mt-0.5 opacity-70" : ""}`}>
          {detalle}
        </p>
      )}
    </div>
  );
}

// ─── Todos los `title` de la web, como pista ──────────────────────────────────
// Había 156 `title` repartidos por cuarenta componentes —en filas de listas,
// chips, iconos— y cada uno salía con el recuadro gris del sistema, un segundo
// tarde y nunca con el teclado. Envolverlos uno a uno con `Pista` era mucho
// código repetido y dejarse alguno; esto los cubre todos, también los que se
// escriban mañana.
//
// Al entrar el ratón (o el foco con Tab) en algo con `title`, el texto se
// APARTA a `data-pista-titulo` —para que no salgan los dos— y se enseña el
// globo de la casa. Al salir se devuelve tal cual: el `title` sigue siendo el
// nombre o la descripción para quien usa lector de pantalla.

/** Montado una vez (en el layout). */
export function PistasGlobales() {
  const [actual, setActual] = useState<{ ancla: DOMRect; texto: string } | null>(null);

  useEffect(() => {
    let el: HTMLElement | null = null;
    let espera: number | undefined;

    const devolver = () => {
      window.clearTimeout(espera);
      if (el) {
        const guardado = el.dataset.pistaTitulo;
        if (guardado !== undefined) {
          el.setAttribute("title", guardado);
          delete el.dataset.pistaTitulo;
        }
        el = null;
      }
      setActual((antes) => {
        if (antes) apuntarCierre();
        return null;
      });
    };

    const tomar = (objetivo: HTMLElement, inmediata: boolean) => {
      if (objetivo === el) return;
      devolver();
      const texto = objetivo.getAttribute("title")?.trim();
      if (!texto) return;
      objetivo.dataset.pistaTitulo = objetivo.getAttribute("title") ?? "";
      objetivo.removeAttribute("title");
      el = objetivo;
      const sacar = () => {
        if (el === objetivo) setActual({ ancla: objetivo.getBoundingClientRect(), texto });
      };
      if (inmediata || vieneDeOtra()) sacar();
      else espera = window.setTimeout(sacar, ESPERA_MS);
    };

    /** Lo que tiene pista: un `title` o uno ya apartado por nosotros. Los
     *  `iframe` no: el del visor del navegador taparía la hoja del parte. */
    const conPista = (t: EventTarget | null): HTMLElement | null => {
      const e = (t as Element | null)?.closest?.("[title], [data-pista-titulo]");
      return e instanceof HTMLElement && e.tagName !== "IFRAME" ? e : null;
    };

    const sobre = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const objetivo = conPista(e.target);
      if (objetivo) tomar(objetivo, false);
      else if (el) devolver();
    };
    const foco = (e: FocusEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && t.matches(":focus-visible") && t.hasAttribute("title")) tomar(t, true);
    };
    const fuera = () => devolver();

    document.addEventListener("pointerover", sobre);
    document.addEventListener("pointerdown", fuera, true);
    document.addEventListener("focusin", foco);
    document.addEventListener("focusout", fuera);
    window.addEventListener("scroll", fuera, true);
    window.addEventListener("blur", fuera);
    return () => {
      devolver();
      document.removeEventListener("pointerover", sobre);
      document.removeEventListener("pointerdown", fuera, true);
      document.removeEventListener("focusin", foco);
      document.removeEventListener("focusout", fuera);
      window.removeEventListener("scroll", fuera, true);
      window.removeEventListener("blur", fuera);
    };
  }, []);

  if (!actual || typeof document === "undefined") return null;
  return createPortal(<Globo ancla={actual.ancla} lado="abajo" detalle={actual.texto} />, document.body);
}
