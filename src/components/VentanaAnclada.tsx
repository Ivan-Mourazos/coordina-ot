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
  alto = 240,
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
  const sitio = sitioDeMenu(anclaje.rect, {
    ventana,
    alto,
    ancho: Math.min(ancho, ventana.ancho - 16),
  });

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={etiqueta}
      // Ver Select.tsx: marca de portal para que los paneles flotantes no lo
      // tomen por un clic fuera y se cierren solos.
      data-en-portal=""
      className="ventana-3d scroll-thin fixed z-[70] overflow-y-auto rounded-xl p-2.5 text-[11px] text-text"
      style={{ ...sitio, maxHeight: alto }}
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
