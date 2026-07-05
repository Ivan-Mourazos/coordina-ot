"use client";

import { useEffect, useRef } from "react";

/** Confirmación ligera para acciones con consecuencias (aprobar, anular…).
 *  Escape o clic fuera cancelan; el botón de confirmar recibe el foco. */
export function ConfirmDialog({
  abierto,
  titulo,
  mensaje,
  tono = "primaria",
  onConfirmar,
  onCancelar,
}: {
  abierto: boolean;
  titulo: string;
  mensaje: string;
  tono?: "primaria" | "peligro" | "neutra";
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    btnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancelar();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [abierto, onCancelar]);

  if (!abierto) return null;

  const toneCls =
    tono === "peligro"
      ? "bg-red-600 text-white hover:bg-red-700"
      : "bg-teal-600 text-white hover:bg-teal-700";

  return (
    <div className="fixed inset-0 z-[60]" role="alertdialog" aria-modal="true" aria-label={titulo}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancelar} />
      <div className="glass-panel-strong absolute left-1/2 top-1/3 w-full max-w-sm -translate-x-1/2 rounded-2xl p-4">
        <h3 className="text-sm font-bold text-text">{titulo}</h3>
        <p className="mt-1.5 text-sm text-text-muted">{mensaje}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancelar}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text"
          >
            Cancelar
          </button>
          <button
            ref={btnRef}
            onClick={onConfirmar}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${toneCls}`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
