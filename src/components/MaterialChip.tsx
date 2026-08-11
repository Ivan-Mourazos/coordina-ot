"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MaterialAsignado } from "@/lib/types";
import { sitioDeMenu, ventanaActual } from "@/lib/menu-flotante";

// ─── El material de la OF: lo que lleva y lo que está reservado ──────────────
// Antes esto solo enseñaba las RESERVAS, y una OF con material asignado pero
// sin reservar parecía no llevar nada. Pasó con AR.26.03981: 20 m de lona en la
// OF, cero reservas, y el detalle del pedido en blanco.
//
// Son dos cosas y hacen falta las dos: lo ASIGNADO es lo que la OF necesita
// para hacerse (viene del escandallo de RPS) y la RESERVA es haberlo apartado
// del almacén. Se enseñan juntas, porque lo que se quiere saber de un vistazo
// es justo la diferencia: qué falta por reservar.

const ANCHO = 288; // w-72
const ALTO = 240;

function MaterialPopover({
  materiales,
  anchor,
  disparador,
  onClose,
}: {
  materiales: readonly MaterialAsignado[];
  anchor: DOMRect;
  /** El botón que lo abrió. Va aquí porque el popover se pinta en un PORTAL,
   *  así que el botón no está dentro de `ref` y el cierre por "clic fuera" lo
   *  contaba como fuera: al pulsarlo por segunda vez, el `mousedown` cerraba y
   *  el `click` que venía detrás lo volvía a abrir. Resultado, un panel que no
   *  se podía cerrar con su propio botón. */
  disparador: HTMLElement | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const destino = e.target as Node;
      // El disparador NO es "fuera": de cerrarlo ya se encarga su propio
      // onClick, que es quien sabe si toca abrir o cerrar.
      if (disparador?.contains(destino)) return;
      if (ref.current && !ref.current.contains(destino)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, disparador]);

  const ventana = ventanaActual();
  if (typeof document === "undefined" || !ventana) return null;
  const sitio = sitioDeMenu(anchor, { ventana, alto: ALTO, ancho: ANCHO });

  const reservadas = materiales.filter((m) => m.reservada > 0).length;

  return createPortal(
    <div
      ref={ref}
      // Ver Select.tsx: marca de portal para que los paneles flotantes no lo
      // tomen por un clic fuera y se cierren solos.
      data-en-portal=""
      className="glass-pop scroll-thin fixed z-[70] overflow-y-auto rounded-xl p-2.5"
      style={{ ...sitio, maxHeight: ALTO, background: "var(--surface)" }}
    >
      <p className="mb-1.5 flex items-center gap-1.5 border-b border-[var(--glass-border)] pb-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
        🧵 Material de la OF ({materiales.length})
        <span className="ml-auto font-semibold normal-case tracking-normal text-teal-700 dark:text-teal-300">
          {reservadas > 0 ? `${reservadas} reservado${reservadas === 1 ? "" : "s"}` : "sin reservar"}
        </span>
      </p>
      <ul className="space-y-1">
        {materiales.map((m, i) => (
          <li key={`${m.descripcion}-${i}`} className="flex items-start justify-between gap-2 text-[11px]">
            <span className="min-w-0 text-text">
              {m.descripcion}
              {/* La reserva, debajo y solo si la hay: lo que se busca aquí es
                  precisamente lo que NO está reservado. */}
              {m.reservada > 0 && (
                <span className="block text-[10px] text-teal-700 dark:text-teal-300">
                  reservado {m.reservada}
                </span>
              )}
            </span>
            <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono font-semibold text-text ring-1 ring-border">
              {m.cantidad}
            </span>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}

/** Botón "Material (N)" que abre un mini panel con lo que lleva la OF y cuánto
 *  de ello está reservado. Sin material, un estado gris discreto. */
export function MaterialChip({ materiales }: { materiales?: readonly MaterialAsignado[] }) {
  // El sitio donde se pinta Y el botón que lo abrió, juntos: los dos se
  // averiguan en el mismo clic, y el botón hace falta luego para que el cierre
  // por "clic fuera" no lo cuente como fuera. Leer `btnRef.current` al pintar
  // no vale —React lo prohíbe y además no dispara repintado—, así que se
  // guarda aquí en el momento en que se pulsa.
  const [abierto, setAbierto] = useState<{ rect: DOMRect; el: HTMLElement } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  if (!materiales || materiales.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-text-muted/70">
        🧵 Sin material asignado
      </span>
    );
  }

  const reservadas = materiales.filter((m) => m.reservada > 0).length;
  const todoReservado = reservadas === materiales.length;

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation();
          const el = btnRef.current;
          setAbierto((v) => (v || !el ? null : { rect: el.getBoundingClientRect(), el }));
        }}
        aria-expanded={abierto !== null}
        title={
          todoReservado
            ? "Todo el material está reservado"
            : `${materiales.length - reservadas} de ${materiales.length} sin reservar`
        }
        className={`chip-3d inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
          todoReservado ? "text-teal-700 dark:text-teal-300" : "text-text-muted"
        }`}
      >
        🧵 Material
        {/* Dos números porque son dos cosas: cuánto lleva y cuánto está
            apartado. Con uno solo no se sabe si falta reservar. */}
        <span
          className={`rounded-full px-1.5 text-[10px] font-bold text-white ${
            todoReservado ? "bg-teal-600" : "bg-gray-500"
          }`}
        >
          {reservadas}/{materiales.length}
        </span>
      </button>

      {abierto && (
        <MaterialPopover
          materiales={materiales}
          anchor={abierto.rect}
          disparador={abierto.el}
          onClose={() => setAbierto(null)}
        />
      )}
    </>
  );
}
