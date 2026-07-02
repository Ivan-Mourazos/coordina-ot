"use client";

import { useState } from "react";

/** Devolución con motivo escrito ahí mismo (sustituye al window.prompt):
 *  botón rojo → se despliega el campo + confirmar/cancelar. */
export function DevolverInline({ onDevolver }: { onDevolver: (obs: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [obs, setObs] = useState("");

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
      >
        Devolver
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg bg-red-500/10 p-2 ring-1 ring-red-500/30">
      <textarea
        autoFocus
        value={obs}
        onChange={(e) => setObs(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAbierto(false);
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onDevolver(obs);
        }}
        placeholder="Motivo de la devolución (qué falta o qué corregir)…"
        rows={2}
        className="w-full resize-none rounded-md bg-surface px-2 py-1.5 text-xs text-text outline-none ring-1 ring-border placeholder:text-text-muted focus:ring-red-400"
      />
      <div className="mt-1.5 flex gap-1.5">
        <button
          onClick={() => onDevolver(obs)}
          disabled={!obs.trim()}
          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Confirmar devolución
        </button>
        <button
          onClick={() => setAbierto(false)}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-text-muted hover:text-text"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
