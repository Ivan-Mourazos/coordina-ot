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
import { useScrollBloqueado } from "@/lib/useScrollBloqueado";

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

  // El fondo se congela mientras el panel está abierto: si no, la rueda mueve
  // la bandeja de detrás y al cerrar apareces en otro sitio.
  useScrollBloqueado(true);

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
