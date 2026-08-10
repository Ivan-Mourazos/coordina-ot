"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Cómo pide cerrar el contenido de un panel flotante (la ✕ de su cabecera).
 *
 *  Va por contexto y no por prop para que no quede ninguna vía que se salte la
 *  animación de salida: llamar al `onCerrar` de fuera desmonta el panel en
 *  seco, y ese es justo el fallo que esto viene a arreglar. Fuera de un
 *  `PanelFlotante` no hace nada, que es lo correcto: no hay panel que cerrar. */
const CerrarPanel = createContext<() => void>(() => {});

export const useCerrarPanel = () => useContext(CerrarPanel);

/** El botón de cerrar de la cabecera de un panel.
 *
 *  Es un componente y no un `onClick` suelto porque el contexto solo se ve
 *  DENTRO del `PanelFlotante`: quien lo monta está por encima del proveedor y
 *  allí `useCerrarPanel` no encontraría nada. */
export function BotonCerrarPanel({ className = "" }: { className?: string }) {
  const cerrar = useCerrarPanel();
  return (
    <button
      type="button"
      onClick={cerrar}
      className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text ${className}`}
    >
      Cerrar · Esc
    </button>
  );
}

/** Contenedor común de los desplegables del tablero (el «+N más» de una fase y
 *  el panel de un compañero).
 *
 *  Existe para que los dos se comporten igual: mismo sitio, mismo fondo, misma
 *  forma de cerrarse. Antes eran dos implementaciones distintas y se notaba.
 *
 *  Flota en vez de empujar: si creciera el bloque de arriba, la página daría un
 *  salto y se perdería el alto que el rediseño acaba de ganar. Y mientras está
 *  abierto se congela el scroll del fondo, porque si no la rueda mueve la
 *  bandeja de detrás y al cerrar apareces en otro sitio. */
/** Ancho de TODOS los desplegables del tablero. Uno solo a propósito: el de
 *  tus pedidos y el de un compañero enseñan lo mismo, y verlos de dos tamaños
 *  distintos hacía pensar que eran cosas distintas. */
const ANCHO = "46rem";

// Cuántos PanelFlotante hay montados a la vez. A nivel de MÓDULO a propósito,
// no por instancia: el "+N más" de una fase y el panel de un compañero son
// estados independientes (Board.tsx guarda faseAbierta, TecnicoCard.tsx guarda
// expanded), así que pueden convivir los dos — con teclado se llega al
// segundo sin cerrar el primero. Si cada instancia guardara y restaurara su
// PROPIO body.style.overflow, el que se desmonta primero pisaría el estilo
// que ya había puesto el segundo (que sigue abierto): "hidden" se perdería
// mientras aún hace falta, o el segundo en cerrarse restauraría un valor
// capturado cuando el body YA estaba congelado, dejándolo congelado para
// siempre aunque no quede ningún panel abierto. El contador solo congela al
// pasar de 0→1 y solo restaura al volver a 0.
let bloqueos = 0;
let overflowOriginal = "";
let paddingOriginal = "";

function bloquearScroll() {
  if (bloqueos === 0) {
    const { body } = document;
    overflowOriginal = body.style.overflow;
    paddingOriginal = body.style.paddingRight;
    // Compensa el ancho de la barra de scroll para que el fondo no dé un
    // salto lateral al congelarlo.
    const hueco = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (hueco > 0) body.style.paddingRight = `${hueco}px`;
  }
  bloqueos += 1;
}

function liberarScroll() {
  bloqueos = Math.max(0, bloqueos - 1);
  if (bloqueos === 0) {
    document.body.style.overflow = overflowOriginal;
    document.body.style.paddingRight = paddingOriginal;
  }
}

export function PanelFlotante({
  onCerrar,
  children,
}: {
  onCerrar: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Cerrar se pide aquí y lo ejecuta la animación al terminar, no el clic.
  // El padre desmonta el panel en cuanto se lo dicen, así que avisarle de
  // inmediato hacía desaparecer la hoja de golpe y no había nada que animar.
  // Todas las vías de cierre —Escape, clic fuera, fondo, la ✕ de dentro— pasan
  // por aquí, para que no haya una que se salte la salida.
  const [cerrando, setCerrando] = useState(false);
  const pedirCierre = useCallback(() => setCerrando(true), []);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) pedirCierre();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") pedirCierre();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pedirCierre]);

  useEffect(() => {
    bloquearScroll();
    return liberarScroll;
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center pt-24">
      {/* Fondo suave: separa el panel sin apagar el tablero, que sigue siendo
          contexto útil mientras decides. */}
      <div
        onClick={pedirCierre}
        aria-hidden
        className={`absolute inset-0 bg-black/15 ${cerrando ? "overlay-out" : "overlay-in"}`}
      />
      <div
        ref={ref}
        style={{ background: "var(--surface)", width: `min(${ANCHO}, 92vw)` }}
        className={`scroll-thin relative max-h-[60vh] overflow-y-auto rounded-xl p-3 ${
          cerrando ? "pop-out" : "glass-pop"
        }`}
        onAnimationEnd={(e) => {
          // Solo la animación de ESTA hoja: `animationend` burbujea y dentro
          // hay cosas animadas (el punto de quien está fichando), que si no
          // dispararían el cierre nada más abrir.
          if (e.target !== e.currentTarget) return;
          if (cerrando) onCerrar();
        }}
      >
        <CerrarPanel.Provider value={pedirCierre}>{children}</CerrarPanel.Provider>
      </div>
    </div>
  );
}
