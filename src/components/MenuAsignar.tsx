"use client";

import type { Operario } from "@/lib/types";
import { aplicarSitio, sitioDeMenu, ventanaActual } from "@/lib/menu-flotante";
import { usePopover } from "@/lib/usePopover";
import { tintaSobre } from "@/lib/tinta";

/** Alto máximo del menú, para decidir si abre hacia arriba o hacia abajo. */
const ALTO_MAX = 260;
/** Ancho fijo (w-44 = 11rem). Sabido a propósito: con el ancho se puede sujetar
 *  el menú por los DOS lados y no hay forma de que se salga de la pantalla. */
const ANCHO = 176;

/** Menú para dar un parte a alguien sin arrastrarlo.
 *
 *  Sustituye al arrastre, que se retiró: apuntar y soltar en la tarjeta de un
 *  compañero es un gesto fino —falla con el pulso, no se puede deshacer a
 *  medias y en teclado no existe—, y la única razón de tenerlo era que no
 *  había alternativa. Con el menú, asignar es elegir un nombre de una lista.
 *
 *  Se abre desde la tarjeta y no se lleva el clic de encima: pulsar el parte
 *  sigue abriéndolo, que es lo que más se hace.
 *
 *  Estaba `absolute` dentro de la tarjeta y, en la bandeja de "Sin asignar", se
 *  abría fuera de la pantalla —la tarjeta está pegada al borde y encima el
 *  mini-PDF tiene su propio recorte—. Pasó a un portal y, desde el 17/11/2026,
 *  es un popover nativo (`usePopover`): capa superior sin recortes, clic fuera
 *  y Escape del navegador, sin salir de la tarjeta en el DOM. */
export function MenuAsignar({
  operarios,
  miId,
  onAsignar,
  claseBoton = "rounded-md bg-brand-500 px-2 py-1 text-[10px] font-bold text-brand-950 shadow-sm hover:bg-brand-600",
}: {
  operarios: Operario[];
  miId: string | null;
  onAsignar: (operarioId: string) => void;
  /** Cómo se pinta el botón. En la bandeja es una barra al pie de la
   *  miniatura; en su sitio de siempre, un chip. */
  claseBoton?: string;
}) {
  const { open, setOpen, ref, panelRef, idPanel } = usePopover<HTMLButtonElement>({
    colocar: (caja, panel) => {
      const ventana = ventanaActual();
      if (!ventana) return;
      aplicarSitio(panel, {
        ...sitioDeMenu(caja, { ventana, alto: ALTO_MAX, alignRight: true, ancho: ANCHO }),
        maxHeight: ALTO_MAX,
      });
    },
  });

  // Yo primero: lo más frecuente es cogerse un parte uno mismo.
  const orden = [
    ...operarios.filter((o) => o.id === miId),
    ...operarios.filter((o) => o.id !== miId),
  ];

  return (
    <div
      className={`w-full transition-opacity ${
        open ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100"
      }`}
    >
      <button
        ref={ref}
        type="button"
        popoverTarget={idPanel}
        // Lo abre `popoverTarget`; esto solo evita que el clic llegue a la
        // tarjeta y abra el parte.
        onClick={(e) => e.stopPropagation()}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Dar este parte a alguien"
        className={claseBoton}
      >
        Asignar
      </button>

      <div
        ref={panelRef}
        id={idPanel}
        popover="auto"
        role="menu"
        className="glass-pop scroll-thin overflow-y-auto rounded-xl p-1"
        // El menú cuelga de la tarjeta en el DOM: sin esto, pulsar un nombre (o
        // Intro/Espacio sobre él) llegaría a la tarjeta y abriría el parte.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {open &&
          orden.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onAsignar(o.id);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-text hover:bg-[var(--glass-highlight)]"
            >
              <span
                className="grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
                style={{ background: o.color, color: tintaSobre(o.color) }}
              >
                {o.iniciales}
              </span>
              {o.id === miId ? `${o.nombre} (tú)` : o.nombre}
            </button>
          ))}
      </div>
    </div>
  );
}
