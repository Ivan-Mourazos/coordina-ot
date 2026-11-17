"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
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
 *  salto y se perdería el alto que el rediseño acaba de ganar. */
/** Ancho de TODOS los desplegables del tablero. Uno solo a propósito: el de
 *  tus pedidos y el de un compañero enseñan lo mismo, y verlos de dos tamaños
 *  distintos hacía pensar que eran cosas distintas. */
// 62rem y no 46: el panel de un compañero lleva una fila por pedido con seis
// datos (código, familia, cliente, fecha, OF y tiempo) y a 46 rem el cliente se
// quedaba en dos palabras. Sigue con el tope de 92vw para pantallas pequeñas.
const ANCHO = "62rem";

// ─── <dialog> nativo con `showModal()` (17/11/2026) ──────────────────────────
// Antes era un `div` con `role="dialog"`, su telón, su clic fuera (que tenía
// que hacer la vista gorda con lo marcado `data-en-portal`), su Escape en
// `capas-escape`, su trampa de foco y su bloqueo del scroll del `body`. Ahora:
//
//  · la página de detrás queda inerte (ni clic ni Tab) y el foco vuelve solo a
//    lo que abrió el panel al cerrarse;
//  · Escape y el clic fuera (`closedby="any"`) cierran solo la capa de arriba:
//    con la lista de un Select, un menú o una confirmación abiertos encima, se
//    van ellos primero. Lo que cuelga del panel en el DOM cuenta como dentro;
//  · el telón es el `::backdrop` y no deja pasar la rueda a la bandeja de
//    detrás (`overscroll-behavior`, en globals.css).
//
// Lo único que se hace a mano es la animación de salida: Escape y el clic fuera
// llegan como `cancel`, que se para, se anima `pop-out` y al terminar se llama
// a `close()`. El aviso al padre va siempre en `close`, para que el foco vuelva
// antes de que React desmonte el panel.
export function PanelFlotante({
  onCerrar,
  children,
  titulo,
}: {
  onCerrar: () => void;
  /** Cómo se llama esta hoja, para el lector de pantalla: la fase, el nombre
   *  del compañero. Corto y estable: el encabezado visible lleva además la
   *  cuenta de OF, que cambia sola y no es parte del nombre. */
  titulo: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  // Cerrar se pide aquí y lo ejecuta la animación al terminar, no el clic.
  // Todas las vías de cierre —Escape, clic fuera, la ✕ de dentro— pasan por
  // aquí, para que no haya una que se salte la salida.
  const [cerrando, setCerrando] = useState(false);
  const pedirCierre = useCallback(() => setCerrando(true), []);

  useLayoutEffect(() => {
    const dlg = ref.current;
    if (dlg && !dlg.open) dlg.showModal();
  }, []);

  const alCerrar = useEffectEvent(onCerrar);
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const h = () => alCerrar();
    dlg.addEventListener("close", h);
    return () => dlg.removeEventListener("close", h);
  }, []);

  // Safari no conoce `closedby`: allí el clic en el telón llega al propio
  // <dialog> con las coordenadas fuera de su caja.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg || "closedBy" in HTMLDialogElement.prototype) return;
    const h = (e: MouseEvent) => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      const dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!dentro) pedirCierre();
    };
    dlg.addEventListener("click", h);
    return () => dlg.removeEventListener("click", h);
  }, [pedirCierre]);

  return (
    <dialog
      ref={ref}
      aria-label={titulo}
      {...({ closedby: "any" } as Record<string, string>)}
      onCancel={(e) => {
        e.preventDefault();
        pedirCierre();
      }}
      onAnimationEnd={(e) => {
        // Solo la salida de ESTA hoja: `animationend` burbujea y dentro hay
        // cosas animadas (el punto de quien está fichando), y el telón también
        // avisa aquí al terminar su propia animación.
        if (e.target !== e.currentTarget || e.animationName !== "pop-out") return;
        if (cerrando) ref.current?.close();
      }}
      style={{ background: "var(--surface)", width: `min(${ANCHO}, 92vw)` }}
      className={`panel-flotante scroll-thin inset-x-0 top-24 bottom-auto mx-auto my-0 max-h-[60vh] max-w-none overflow-y-auto rounded-xl border-0 p-3 text-text ${
        cerrando ? "pop-out" : "glass-pop"
      }`}
    >
      <CerrarPanel.Provider value={pedirCierre}>{children}</CerrarPanel.Provider>
    </dialog>
  );
}
