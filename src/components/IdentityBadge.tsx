"use client";

import type { Operario } from "@/lib/types";
import { usePopover } from "@/lib/usePopover";

/** Control de cabecera: quién eres ahora mismo + desplegable para cambiar
 *  de técnico sin volver a la pantalla de selección inicial. */
export function IdentityBadge({
  yo,
  operarios,
  onChange,
}: {
  yo: Operario;
  operarios: Operario[];
  onChange: (id: string) => void;
}) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="glass-chip flex items-center gap-1.5 rounded-lg py-1 pl-1 pr-2 text-xs font-semibold text-text"
        title="Cambiar de técnico"
      >
        <span
          className="grid size-6 place-items-center rounded-full text-[10px] font-bold text-white"
          style={{ background: yo.color }}
        >
          {yo.iniciales}
        </span>
        {yo.nombre}
      </button>
      {open && (
        <div className="glass-pop absolute right-0 top-full z-40 mt-1.5 w-44 rounded-xl p-1">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Cambiar de técnico
          </p>
          {operarios.map((op) => (
            <button
              key={op.id}
              onClick={() => {
                onChange(op.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium hover:bg-[var(--glass-highlight)] ${
                op.id === yo.id ? "text-brand-600" : "text-text"
              }`}
            >
              <span
                className="grid size-5 place-items-center rounded-full text-[9px] font-bold text-white"
                style={{ background: op.color }}
              >
                {op.iniciales}
              </span>
              {op.nombre}
              {op.id === yo.id && <span className="ml-auto text-[10px]">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
