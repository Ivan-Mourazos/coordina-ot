"use client";

import type { Operario } from "@/lib/types";
import { usePopover } from "@/lib/usePopover";

/** Menú para dar un parte a alguien sin arrastrarlo.
 *
 *  Sustituye al arrastre, que se retiró: apuntar y soltar en la tarjeta de un
 *  compañero es un gesto fino —falla con el pulso, no se puede deshacer a
 *  medias y en teclado no existe—, y la única razón de tenerlo era que no
 *  había alternativa. Con el menú, asignar es elegir un nombre de una lista.
 *
 *  Se abre desde la tarjeta y no se lleva el clic de encima: pulsar el parte
 *  sigue abriéndolo, que es lo que más se hace. */
export function MenuAsignar({
  operarios,
  miId,
  onAsignar,
}: {
  operarios: Operario[];
  miId: string | null;
  onAsignar: (operarioId: string) => void;
}) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();

  // Yo primero: lo más frecuente es cogerse un parte uno mismo.
  const orden = [
    ...operarios.filter((o) => o.id === miId),
    ...operarios.filter((o) => o.id !== miId),
  ];

  return (
    <div
      ref={ref}
      className={`relative transition-opacity ${
        open ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100"
      }`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Dar este parte a alguien"
        className="rounded-md bg-brand-500 px-2 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-brand-600"
      >
        Asignar
      </button>

      {open && (
        <div
          role="menu"
          className="glass-pop absolute right-0 top-full z-40 mt-1 w-44 rounded-xl p-1"
          onClick={(e) => e.stopPropagation()}
        >
          {orden.map((o) => (
            <button
              key={o.id}
              role="menuitem"
              onClick={() => {
                onAsignar(o.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-text hover:bg-[var(--glass-highlight)]"
            >
              <span
                className="grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
                style={{ background: o.color }}
              >
                {o.iniciales}
              </span>
              {o.id === miId ? `${o.nombre} (tú)` : o.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
