"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ─── Por qué el menú va en un PORTAL ─────────────────────────────────────────
// Estaba `absolute` dentro del propio control, y eso le daba dos problemas que
// solo se ven cuando el desplegable no está en mitad de la pantalla:
//
//  · Lo recorta cualquier ancestro con `overflow` — las filas con scroll
//    horizontal de la bandeja, el drawer, la tabla—, así que el menú de
//    "Asignar" de una tarjeta salía cortado por la mitad.
//  · Y contra el borde de la ventana se salía de la pantalla, porque `left-0`
//    no sabe cuánto sitio queda.
//
// En un portal a `document.body` y con posición fija calculada, el menú no lo
// recorta nadie y se puede sujetar dentro de la ventana. Es el mismo patrón que
// ya usaba el popover de reservas.

/** Margen mínimo con los bordes de la ventana. */
const MARGEN = 8;
/** Alto máximo del menú (`max-h-64`), para decidir si abre arriba o abajo. */
const ALTO_MAX = 256;

export interface SelectOption {
  value: string;
  label: string;
  /** Adorno a la izquierda: punto de color, icono de familia, avatar… */
  icon?: React.ReactNode;
}

/** Select propio con estética de vidrio (los <select> nativos no se pueden
 *  tematizar). Teclado: ↑/↓ mueven, Enter elige, Esc cierra; clic fuera
 *  cierra. `value` null = placeholder. */
export function Select({
  value,
  onChange,
  options,
  placeholder = "—",
  alignRight = false,
  className = "",
  acentuarActivo = false,
  etiquetaVaciar,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: SelectOption[];
  /** Opción vacía al principio (para "Todos", "Sin asignar"…). Si es null,
   *  no se ofrece vaciar. */
  placeholder?: string | null;
  alignRight?: boolean;
  className?: string;
  /** Para los filtros: con valor elegido se pinta con el color de marca, para
   *  que se vea CUÁL está filtrando sin tener que leer todos los desplegables.
   *  Los selectores que siempre tienen valor (autor, revisor, orden) no lo
   *  usan: ahí el acento sería permanente y no diría nada. */
  acentuarActivo?: boolean;
  /** Texto de la opción que quita el valor, cuando no sirve el del botón. */
  etiquetaVaciar?: string;
}) {
  // `caja` es el sitio del botón en el momento de abrir: null = cerrado. Guarda
  // el rectángulo y no solo un booleano porque el menú vive en otro sitio del
  // DOM y necesita saber dónde pintarse.
  const [caja, setCaja] = useState<DOMRect | null>(null);
  const open = caja !== null;
  const setOpen = (v: boolean) =>
    setCaja(v ? (btnRef.current?.getBoundingClientRect() ?? null) : null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  // Cierre por Escape y por clic fuera. Se hace aquí y no con `usePopover`
  // porque hay DOS trozos que cuentan como "dentro" y viven separados: el botón
  // y el menú, que está en un portal. Con un solo contenedor vigilado, pulsar
  // el menú se leía como clic fuera.
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
    // perseguirlo con un recálculo en cada píxel.
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

  // El botón cerrado y la opción de vaciar dicen cosas distintas: el botón
  // lleva el nombre del campo ("Familia") y la opción, qué pasa al elegirla
  // ("Todas"). Con un solo texto, el menú del filtro de familia ofrecía una
  // opción llamada "Familia", que no dice nada de lo que hace.
  const items: SelectOption[] = [
    ...(placeholder !== null ? [{ value: "", label: etiquetaVaciar ?? placeholder }] : []),
    ...options,
  ];
  const selected = options.find((o) => o.value === value) ?? null;
  const [activeIx, setActiveIx] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-ix="${activeIx}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIx]);

  // Al abrir, el activo arranca en la opción seleccionada
  function abrir() {
    const ix = items.findIndex((o) => o.value === (value ?? ""));
    setActiveIx(ix >= 0 ? ix : 0);
    setOpen(true);
  }

  function elegir(o: SelectOption) {
    onChange(o.value === "" ? null : o.value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        abrir();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIx((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIx(items.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      elegir(items[activeIx]);
    }
  }

  // Dónde cabe el menú. Se sujeta a la ventana por los dos lados y, si abajo no
  // queda sitio, se abre hacia arriba: contra el borde inferior se quedaba
  // medio menú fuera de la pantalla.
  const sitio = (() => {
    if (!caja || typeof window === "undefined") return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cabeAbajo = caja.bottom + 4 + ALTO_MAX <= vh - MARGEN;
    // Se ancla por el lado que toque —izquierda, o derecha si `alignRight`— en
    // vez de calcular el ancho del menú, que no se sabe hasta pintarlo. Así el
    // borde anclado queda sujeto a la ventana sin adivinar nada, y el otro lo
    // limita `maxWidth`.
    return {
      ...(alignRight
        ? { right: Math.max(MARGEN, vw - caja.right) }
        : { left: Math.min(Math.max(MARGEN, caja.left), vw - MARGEN) }),
      ...(cabeAbajo ? { top: caja.bottom + 4 } : { bottom: vh - caja.top + 4 }),
      minWidth: caja.width,
      maxWidth: vw - 2 * MARGEN,
    };
  })();

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : abrir())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        // `glass-chip-activo` y no un `bg-*` de Tailwind: el fondo de
        // `.glass-chip` gana siempre a las utilidades (ver globals.css), así
        // que el acento de "este filtro está recortando la lista" no llegaba a
        // pintarse nunca.
        className={`glass-chip flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-border-strong ${
          acentuarActivo && selected
            ? "glass-chip-activo text-brand-700 dark:text-brand-300"
            : selected
              ? "text-text"
              : "text-text-muted"
        }`}
      >
        {selected?.icon}
        <span className="min-w-0 flex-1 truncate text-left">
          {selected?.label ?? placeholder ?? "—"}
        </span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`size-3 shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open &&
        sitio &&
        createPortal(
        <ul
          ref={(el) => {
            listRef.current = el;
            menuRef.current = el;
          }}
          role="listbox"
          className="glass-pop scroll-thin fixed z-[60] max-h-64 w-max overflow-y-auto rounded-xl p-1"
          style={sitio}
        >
          {items.map((o, ix) => {
            const isSel = (value ?? "") === o.value;
            return (
              <li key={o.value || "__empty"}>
                <button
                  type="button"
                  data-ix={ix}
                  role="option"
                  aria-selected={isSel}
                  onClick={() => elegir(o)}
                  onMouseEnter={() => setActiveIx(ix)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium whitespace-nowrap ${
                    ix === activeIx ? "bg-[var(--glass-highlight)] text-text" : "text-text-muted"
                  } ${isSel ? "text-brand-600 dark:text-brand-400" : ""}`}
                >
                  {o.icon}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {isSel && (
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>,
          document.body,
        )}
    </div>
  );
}

/** Avatar pequeño para opciones de operario. */
export function OpDot({ color, iniciales }: { color: string; iniciales: string }) {
  return (
    <span
      className="grid size-4.5 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
      style={{ background: color }}
    >
      {iniciales}
    </span>
  );
}
