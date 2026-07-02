"use client";

import { useEffect, useRef, useState } from "react";
import { usePopover } from "@/lib/usePopover";

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
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: SelectOption[];
  /** Opción vacía al principio (para "Todos", "Sin asignar"…). Si es null,
   *  no se ofrece vaciar. */
  placeholder?: string | null;
  alignRight?: boolean;
  className?: string;
}) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const items: SelectOption[] = [
    ...(placeholder !== null ? [{ value: "", label: placeholder }] : []),
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

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : abrir())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`glass-chip flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-border-strong ${
          selected ? "text-text" : "text-text-muted"
        }`}
      >
        {selected?.icon}
        <span className="min-w-0 flex-1 truncate text-left">
          {selected?.label ?? placeholder ?? "—"}
        </span>
        <svg
          viewBox="0 0 24 24"
          className={`size-3 shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className={`glass-pop scroll-thin absolute top-full z-40 mt-1 max-h-64 w-max min-w-full overflow-y-auto rounded-xl p-1 ${
            alignRight ? "right-0" : "left-0"
          }`}
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
                    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
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
