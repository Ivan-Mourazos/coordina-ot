"use client";

import { aplicarSitio, sitioDeMenu, ventanaActual } from "@/lib/menu-flotante";
import { usePopover } from "@/lib/usePopover";
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
// POR QUÉ NO SE RECORTA. Estaba `absolute` dentro de la propia ficha de la OF,
// y ahí lo recortaba cualquier ancestro con `overflow` —el panel del drawer lo
// tiene—: "Dar por corregida" salía cortada y tapada por el pie del panel.
// Luego fue a un portal en el `body`, con su clic fuera, su Escape en
// `capas-escape` y la marca `data-en-portal`. Desde el 17/11/2026 es un popover
// nativo (`usePopover`): va a la capa superior, donde nada lo recorta, sin
// salir de la ficha en el DOM (la trampa de foco del drawer lo ve dentro); el
// navegador lo cierra al pinchar fuera y con Escape (solo a él) y devuelve el
// foco al botón. `sitioDeMenu` lo sigue volteando hacia arriba si abajo no cabe.

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
  const { open, setOpen, ref, panelRef, idPanel } = usePopover<HTMLButtonElement>({
    colocar: (caja, panel) => {
      const ventana = ventanaActual();
      if (!ventana) return;
      aplicarSitio(
        panel,
        sitioDeMenu(caja, { ventana, alto: acciones.length * ALTO_OPCION + 8, alignRight: true, ancho: ANCHO }),
      );
    },
  });

  // Sin acciones no hay ⋯, pero el panel se queda montado (vacío y cerrado):
  // `usePopover` engancha sus escuchas al panel al montar, y la OF puede ganar
  // acciones luego sin que la fila se vuelva a montar. Con un `return null`
  // aquí, ese ⋯ abría una caja vacía en el centro (revisión del 17/11/2026).
  return (
    <>
      {acciones.length > 0 && <button
        ref={ref}
        type="button"
        popoverTarget={idPanel}
        aria-label="Más acciones"
        aria-expanded={open}
        title="Más acciones para esta OF"
        className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text-muted hover:border-border-strong hover:text-text"
      >
        ⋯
      </button>}

      <div ref={panelRef} id={idPanel} popover="auto" className="glass-pop rounded-xl p-1 text-text">
        {open &&
          acciones.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                // Primero se cierra (el foco vuelve al ⋯) y luego la acción: si
                // abre un ConfirmDialog, al cerrarse este devuelve el foco al ⋯
                // y no al `body`.
                setOpen(false);
                onElegir(a);
              }}
              className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold hover:bg-[var(--glass-highlight)] ${
                a.tono === "peligro" ? "text-error" : "text-text"
              }`}
            >
              {etiqueta(a)}
            </button>
          ))}
      </div>
    </>
  );
}
