"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Operario } from "@/lib/types";
import { sitioDeMenu, ventanaActual } from "@/lib/menu-flotante";

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
 *  El menú va en un PORTAL, igual que el de Select y por lo mismo: estaba
 *  `absolute` dentro de la tarjeta y, en la bandeja de "Sin asignar", se abría
 *  fuera de la pantalla —la tarjeta está pegada al borde y encima el mini-PDF
 *  tiene su propio recorte—, así que la lista de nombres no se podía ni ver. */
export function MenuAsignar({
  operarios,
  miId,
  onAsignar,
}: {
  operarios: Operario[];
  miId: string | null;
  onAsignar: (operarioId: string) => void;
}) {
  // El rectángulo del botón al abrir, no un booleano: el menú vive en otro
  // sitio del DOM y necesita saber dónde pintarse.
  const [caja, setCaja] = useState<DOMRect | null>(null);
  const open = caja !== null;
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Dos trozos cuentan como "dentro" y viven separados: el botón y el menú
    // del portal. Vigilando un solo contenedor, pulsar un nombre se leía como
    // clic fuera y el menú se cerraba sin asignar nada.
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setCaja(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCaja(null);
    }
    // Al mover la página el botón se va y el menú se quedaría flotando solo.
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

  // Yo primero: lo más frecuente es cogerse un parte uno mismo.
  const orden = [
    ...operarios.filter((o) => o.id === miId),
    ...operarios.filter((o) => o.id !== miId),
  ];

  const ventana = ventanaActual();
  const sitio =
    caja && ventana
      ? sitioDeMenu(caja, { ventana, alto: ALTO_MAX, alignRight: true, ancho: ANCHO })
      : null;

  return (
    <div
      className={`transition-opacity ${
        open ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100"
      }`}
    >
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setCaja(open ? null : (btnRef.current?.getBoundingClientRect() ?? null));
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Dar este parte a alguien"
        className="rounded-md bg-brand-500 px-2 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-brand-600"
      >
        Asignar
      </button>

      {sitio &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            // Ver Select.tsx: marca de portal, para que los paneles flotantes no
            // tomen este clic por un clic fuera y se cierren solos.
            data-en-portal=""
            style={{ ...sitio, maxHeight: ALTO_MAX }}
            className="glass-pop scroll-thin fixed z-[60] overflow-y-auto rounded-xl p-1"
            onClick={(e) => e.stopPropagation()}
          >
            {orden.map((o) => (
              <button
                key={o.id}
                role="menuitem"
                onClick={() => {
                  onAsignar(o.id);
                  setCaja(null);
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
          </div>,
          document.body,
        )}
    </div>
  );
}
