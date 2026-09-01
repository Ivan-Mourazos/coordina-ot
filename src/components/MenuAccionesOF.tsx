"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sitioDeMenu, ventanaActual } from "@/lib/menu-flotante";
import type { AccionDef } from "@/lib/acciones";

// ─── El cajón de "⋯" de una OF ───────────────────────────────────────────────
// La fila de acciones llegaba a cinco botones (el revisor revisando: reloj,
// Aprobar, Devolver, Dejar sin revisar, Anular) y se partía en dos líneas: la
// altura de cada OF bailaba según su estado, y "Anular OF" se quedaba flotando
// solo a la derecha en la segunda, como si fuera de otra cosa.
//
// Fuera se queda lo de todos los días —el reloj y el paso siguiente del
// flujo—; aquí dentro, lo que se usa de higos a brevas. No es esconderlo: es
// que un botón que se pulsa una vez al mes no puede competir por el sitio con
// uno que se pulsa veinte veces al día.
//
// POR QUÉ VA EN UN PORTAL. Estaba `absolute` dentro de la propia ficha de la
// OF, y ahí lo recorta cualquier ancestro con `overflow` — el panel del drawer
// lo tiene—. La fila de acciones cae al final de la ficha, así que el menú se
// abría justo contra el borde de abajo: "Dar por corregida" salía cortada y
// tapada por el pie del panel. Colgado del `body` no hay quien lo recorte, y
// `sitioDeMenu` lo voltea hacia arriba cuando no cabe abajo.
//
// Mismo camino que ya recorrieron el desplegable de Select y el cuadro de
// confirmación, incluida la marca `data-en-portal` para que los paneles que se
// cierran al hacer clic fuera no se cierren al pulsar aquí dentro.

/** El ancho del menú, en píxeles y sabido de antemano (era `w-56`).
 *
 *  Sabiéndolo, `sitioDeMenu` puede sujetarlo por los dos lados: anclarlo solo
 *  por la derecha deja el borde izquierdo fuera de la pantalla cuando el botón
 *  está pegado al lado izquierdo. */
const ANCHO = 224;

/** Lo que ocupa cada opción, para decidir si cabe abajo o hay que voltearlo. */
const ALTO_OPCION = 30;

export function MenuAccionesOF({
  acciones,
  onElegir,
  etiqueta,
}: {
  acciones: readonly AccionDef[];
  onElegir: (a: AccionDef) => void;
  /** Cómo se llama cada una en ESTA OF ("Aprobar → Jaime"). */
  etiqueta: (a: AccionDef) => string;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // La posición del botón al abrir. `null` = cerrado.
  const [caja, setCaja] = useState<DOMRect | null>(null);
  const open = caja !== null;

  // El cierre se lleva aquí y no con `usePopover` porque hay DOS trozos que
  // cuentan como "dentro" y viven separados: el botón y el menú, que está en un
  // portal. Con un solo contenedor vigilado, pulsar una opción se leería como
  // clic fuera y el menú se cerraría antes de que la acción llegara.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setCaja(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCaja(null);
    }
    // Al hacer scroll o cambiar el tamaño, el botón se mueve y el menú se
    // quedaría flotando donde estaba: se cierra, que es menos molesto que
    // perseguirlo con un recálculo en cada píxel. Mismo criterio que Select.
    function onMover() {
      setCaja(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMover);
    window.addEventListener("scroll", onMover, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMover);
      window.removeEventListener("scroll", onMover, true);
    };
  }, [open]);

  if (acciones.length === 0) return null;

  const ventana = ventanaActual();
  const sitio =
    caja && ventana
      ? sitioDeMenu(caja, {
          ventana,
          alto: acciones.length * ALTO_OPCION + 8,
          alignRight: true,
          ancho: ANCHO,
        })
      : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setCaja(open ? null : (btnRef.current?.getBoundingClientRect() ?? null))}
        aria-label="Más acciones"
        aria-expanded={open}
        title="Más acciones para esta OF"
        className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text-muted hover:border-border-strong hover:text-text"
      >
        ⋯
      </button>

      {sitio &&
        createPortal(
          <div
            ref={menuRef}
            data-en-portal=""
            style={sitio}
            className="glass-pop fixed z-[60] rounded-xl p-1"
          >
            {acciones.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setCaja(null);
                  onElegir(a);
                }}
                className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold hover:bg-[var(--glass-highlight)] ${
                  a.tono === "peligro" ? "text-red-600 dark:text-red-400" : "text-text"
                }`}
              >
                {etiqueta(a)}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
