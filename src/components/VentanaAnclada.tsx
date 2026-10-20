"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { sitioDeMenu, ventanaActual } from "@/lib/menu-flotante";
import { useCapaEscape } from "@/lib/useCapaEscape";

// ─── La ventanita que cuelga de un botón de la ficha ─────────────────────────
// Materiales en Pendientes, y materiales y notas de Producción en el Historial.
// Eran dos piezas distintas: un portal propio en una ficha y un popover nativo
// en la otra, con su ancho, su alto y su manera de cerrarse cada una. Se abría
// lo mismo de dos maneras según por dónde se entrara al pedido.
//
// Aquí queda una: en un portal para que el scroll del panel no la recorte,
// anclada al botón y volteada hacia arriba si abajo no cabe, con techo de alto
// y scroll propio. Se cierra con su botón, con un clic fuera, con Escape (solo
// ella: la ficha sigue abierta) o al mover lo que hay detrás.

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

/** El sitio del botón al abrir y el propio botón. El botón hace falta para que
 *  pulsarlo otra vez no cuente como "clic fuera": el `mousedown` cerraría y el
 *  `click` de detrás la volvería a abrir. */
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

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const destino = e.target as Node;
      // El botón no es "fuera": de cerrarla ya se encarga su propio onClick.
      if (disparador.contains(destino)) return;
      if (ref.current && !ref.current.contains(destino)) onCerrar();
    }
    // Si se mueve el panel de la ficha, el botón se va y la ventana se quedaría
    // flotando en otro sitio. Salvo que lo que se mueva sea ella por dentro.
    function onMover(e?: Event) {
      const donde = e?.target;
      if (donde instanceof Node && ref.current?.contains(donde)) return;
      onCerrar();
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onMover);
    window.addEventListener("scroll", onMover, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onMover);
      window.removeEventListener("scroll", onMover, true);
    };
  }, [onCerrar, disparador]);

  // Escape cierra solo esta ventana y devuelve el foco a su botón; otra
  // pulsación ya cierra la ficha (ver capas-escape.ts).
  useCapaEscape(true, () => {
    onCerrar();
    disparador.focus();
  });

  const ventana = ventanaActual();
  if (typeof document === "undefined" || !ventana) return null;
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

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={etiqueta}
      // Ver Select.tsx: marca de portal para que los paneles flotantes no lo
      // tomen por un clic fuera y se cierren solos.
      data-en-portal=""
      className="ventana-3d scroll-thin fixed z-[70] overflow-y-auto rounded-xl p-2.5 text-[11px] text-text"
      style={{ ...sitio, ...vertical }}
    >
      {children}
    </div>,
    document.body,
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
