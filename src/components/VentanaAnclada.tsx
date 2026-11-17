"use client";

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { sitioDeMenu, ventanaActual } from "@/lib/menu-flotante";

// ─── La ventanita que cuelga de un botón de la ficha ─────────────────────────
// Materiales en Pendientes, y materiales y notas de Producción en el Historial.
// Eran dos piezas distintas: un portal propio en una ficha y un popover nativo
// en la otra, con su ancho, su alto y su manera de cerrarse cada una. Se abría
// lo mismo de dos maneras según por dónde se entrara al pedido.
//
// Aquí queda una, anclada al botón y volteada hacia arriba si abajo no cabe,
// con techo de alto y scroll propio. Se cierra con su botón, con un clic fuera,
// con Escape (solo ella: la ficha sigue abierta) o al mover lo que hay detrás.
//
// Desde el 17/11/2026 es un popover nativo (`popover="auto"`) montado en su
// sitio, ya no un portal al `body`: la capa superior hace que el scroll del
// panel no la recorte, y el clic fuera y Escape los pone el navegador. Como
// sigue dentro de la ficha en el DOM, la trampa de foco del drawer y el clic
// fuera de PanelFlotante la cuentan como suya sin marcas (`data-en-portal`).

/** Lista de artículos con una raya fina entre uno y otro: sin ella, siete
 *  descripciones largas de RPS seguidas se leían como un solo párrafo y no se
 *  sabía dónde acababa cada una. `--border` y no el canto de cristal, que sobre
 *  el fondo blanco de la ventana no se ve. */
export const LISTA = "divide-y divide-border";
export const LINEA = "py-1.5 first:pt-0 last:pb-0";

/** Aire a cada lado de la ventana cuando ocupa el ancho del panel. */
const MARGEN_PANEL = 12;
/** Aire con el borde de la ventana del navegador. */
const MARGEN_VENTANA = 8;
/** Lo mínimo que tiene que quedar debajo del botón para abrir hacia abajo. */
const MINIMO_ABAJO = 160;

/** Clases del botón que la abre, las mismas en las dos fichas. */
export const BOTON_DETALLE =
  "chip-3d inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold";

/** El sitio del botón al abrir y el propio botón (para colgarse de él). */
export interface Anclaje {
  rect: DOMRect;
  el: HTMLElement;
}

/** Abrir y cerrar desde el botón. `alternar` va en su `onClick`. */
export function useVentanaAnclada() {
  const [anclaje, setAnclaje] = useState<Anclaje | null>(null);
  const alternar = useCallback((el: HTMLElement) => {
    setAnclaje((v) => (v ? null : { rect: el.getBoundingClientRect(), el }));
  }, []);
  const cerrar = useCallback(() => setAnclaje(null), []);
  return { anclaje, alternar, cerrar };
}

export function VentanaAnclada({
  anclaje,
  onCerrar,
  etiqueta,
  ancho = 288,
  alto = 400,
  children,
}: {
  anclaje: Anclaje;
  onCerrar: () => void;
  /** Nombre para el lector de pantalla ("Material de la OF 0230706"). */
  etiqueta: string;
  ancho?: number;
  alto?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { el: disparador } = anclaje;
  const alCerrar = useEffectEvent(onCerrar);

  // Montada = abierta. Se abre antes de pintar, y cuando el navegador la
  // cierra (clic fuera, Escape) se avisa al padre para que la desmonte. Con
  // Escape o clic fuera el navegador ya devolvió el foco al botón.
  //
  // Va en `toggle` y no en `beforetoggle` a propósito: el clic fuera salta
  // al soltar el botón del ratón, ANTES del `click`. Si pulsar el propio botón
  // la cerrara en ese momento, su `onClick` (`alternar`) la vería cerrada y
  // la volvería a abrir. `toggle` llega después del `click`: `alternar` ya la
  // cerró y avisar otra vez no cambia nada.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    function cambio(e: Event) {
      if ((e as ToggleEvent).newState === "closed") alCerrar();
    }
    el.addEventListener("toggle", cambio);
    if (!el.matches(":popover-open")) el.showPopover();
    return () => {
      el.removeEventListener("toggle", cambio);
      // Desmontada desde dentro (elegir un día, su ✕) con el foco en ella: al
      // quitarla del DOM el navegador no lo devuelve, y caía en el `body`.
      if (el.contains(document.activeElement)) disparador.focus();
    };
  }, [disparador]);

  useEffect(() => {
    // Si se mueve el panel de la ficha, el botón se va y la ventana se quedaría
    // flotando en otro sitio. Salvo que lo que se mueva sea ella por dentro.
    function onMover(e?: Event) {
      const donde = e?.target;
      if (donde instanceof Node && ref.current?.contains(donde)) return;
      alCerrar();
    }
    window.addEventListener("resize", onMover);
    window.addEventListener("scroll", onMover, true);
    return () => {
      window.removeEventListener("resize", onMover);
      window.removeEventListener("scroll", onMover, true);
    };
  }, []);

  const ventana = ventanaActual();
  if (!ventana) return null;
  // Dentro de la ficha, del ancho del panel lateral (Iván, 20/10/2026): con
  // 288 px las descripciones de RPS se partían en tres renglones y la
  // cantidad quedaba perdida entre ellos. Fuera de una ficha, el ancho de
  // siempre.
  //
  // Y SIEMPRE colgando del botón, hacia abajo, con el alto que quepa y scroll
  // dentro: con el techo fijo de alto, al no caber se volteaba hacia arriba y
  // parecía salir de otro sitio. Solo sube si debajo no quedan ni
  // `MINIMO_ABAJO` px. Ojo: un DOMRect no se copia con `...` (sus campos son
  // del prototipo): hay que sacarlos a mano.
  const { top, bottom, right, width } = anclaje.rect;
  const panel = disparador.closest(".pedido-panel")?.getBoundingClientRect();
  const sitio = panel
    ? sitioDeMenu(
        { top, bottom, left: panel.left + MARGEN_PANEL, right, width },
        { ventana, alto, ancho: Math.min(panel.width - 2 * MARGEN_PANEL, ventana.ancho - 16) },
      )
    : sitioDeMenu(anclaje.rect, {
        ventana,
        alto,
        ancho: Math.min(ancho, ventana.ancho - 16),
      });
  const abajo = ventana.alto - bottom - 4 - MARGEN_VENTANA;
  const arriba = top - 4 - MARGEN_VENTANA;
  const haciaAbajo = abajo >= Math.min(alto, MINIMO_ABAJO) || abajo >= arriba;
  const vertical = haciaAbajo
    ? { top: bottom + 4, bottom: undefined, maxHeight: Math.min(alto, abajo) }
    : { top: undefined, bottom: ventana.alto - top + 4, maxHeight: Math.min(alto, arriba) };

  // Los lados que no se usan, en `auto` y a mano: el navegador pone `inset: 0`
  // y `margin: auto` a los popovers para centrarlos.
  const px = (n: number | undefined) => (n === undefined ? "auto" : n);
  return (
    <div
      ref={ref}
      popover="auto"
      role="dialog"
      aria-label={etiqueta}
      className="ventana-3d scroll-thin m-0 overflow-y-auto rounded-xl p-2.5 text-[11px] text-text"
      style={{
        left: px(sitio.left),
        right: px(sitio.right),
        top: px(vertical.top),
        bottom: px(vertical.bottom),
        minWidth: sitio.minWidth,
        maxWidth: sitio.maxWidth,
        maxHeight: vertical.maxHeight,
      }}
    >
      {children}
    </div>
  );
}

/** Cabecera de un apartado de la ventana: rótulo, cuántos y, a la derecha, lo
 *  que resume su estado. Igual en las dos fichas. */
export function CabeceraVentana({
  titulo,
  cuantos,
  nota,
  claseNota = "text-text-muted",
  tituloNota,
  separada = false,
}: {
  titulo: string;
  cuantos?: number;
  nota?: string;
  claseNota?: string;
  tituloNota?: string;
  /** Hay otro apartado encima: deja aire entre los dos. */
  separada?: boolean;
}) {
  return (
    <p
      className={`mb-1.5 flex items-center gap-1.5 border-b border-[var(--glass-border)] pb-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted ${
        separada ? "mt-3" : ""
      }`}
    >
      {titulo}
      {cuantos !== undefined && ` (${cuantos})`}
      {nota && (
        <span
          className={`ml-auto font-semibold normal-case tracking-normal ${claseNota}`}
          title={tituloNota}
        >
          {nota}
        </span>
      )}
    </p>
  );
}
