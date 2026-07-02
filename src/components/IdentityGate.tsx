"use client";

import type { Operario } from "@/lib/types";
import { Logo } from "./Logo";

/** Pantalla de selección de técnico ("login sin login"). Se muestra cuando
 *  este navegador aún no tiene un técnico recordado en localStorage. */
export function IdentityGate({
  operarios,
  onSelect,
}: {
  operarios: Operario[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="w-full max-w-xl text-center">
        <div className="mb-6 flex justify-center">
          <Logo height={110} />
        </div>
        <h1 className="mb-1 text-lg font-semibold text-text">¿Quién eres?</h1>
        <p className="mb-6 text-sm text-text-muted">
          Elige tu nombre para ver tu zona y tus avisos. Se recuerda en este navegador.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {operarios.map((op) => (
            <button
              key={op.id}
              onClick={() => onSelect(op.id)}
              className="glass-panel flex flex-col items-center gap-2 rounded-2xl p-4 transition-all hover:scale-[1.03] hover:border-brand-400"
            >
              <span
                className="grid size-14 place-items-center rounded-full text-lg font-bold text-white shadow"
                style={{ background: op.color }}
              >
                {op.iniciales}
              </span>
              <span className="text-sm font-semibold text-text">{op.nombre}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
