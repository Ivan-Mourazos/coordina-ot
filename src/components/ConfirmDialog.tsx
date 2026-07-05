"use client";

import { useEffect, useRef, useState } from "react";
import type { AccionDef } from "@/lib/acciones";

/** Estado compartido "acción pendiente de confirmar" (Drawer y PedidoChip):
 *  pedirConfirmacion(a) abre el diálogo si la acción trae texto `confirmar`,
 *  o la ejecuta directamente si no; el componente pinta {dialogo} una vez. */
export function useConfirmacion(ejecutar: (a: AccionDef) => void) {
  const [confirmando, setConfirmando] = useState<AccionDef | null>(null);
  const pedirConfirmacion = (a: AccionDef) => {
    if (a.confirmar) setConfirmando(a);
    else ejecutar(a);
  };
  const dialogo = (
    <ConfirmDialog
      abierto={confirmando !== null}
      titulo={confirmando?.label ?? ""}
      mensaje={confirmando?.confirmar ?? ""}
      tono={confirmando?.tono}
      onConfirmar={() => {
        if (confirmando) ejecutar(confirmando);
        setConfirmando(null);
      }}
      onCancelar={() => setConfirmando(null)}
    />
  );
  return { confirmando, pedirConfirmacion, dialogo };
}

/** Confirmación ligera para acciones con consecuencias (aprobar, anular…).
 *  Escape o clic fuera cancelan; el botón de confirmar recibe el foco.
 *  Trap de foco: Tab circula entre Cancelar y Confirmar. */
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
  const btnConfirmarRef = useRef<HTMLButtonElement>(null);
  const btnCancelarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    btnConfirmarRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancelar();
      } else if (e.key === "Tab") {
        // Focus trap: envolver el foco en los bordes; el resto lo maneja el navegador
        if (e.shiftKey) {
          // Shift+Tab desde el primero (Cancelar) → envolver a Confirmar
          if (document.activeElement === btnCancelarRef.current) {
            e.preventDefault();
            btnConfirmarRef.current?.focus();
          }
        } else {
          // Tab desde el último (Confirmar) → envolver a Cancelar
          if (document.activeElement === btnConfirmarRef.current) {
            e.preventDefault();
            btnCancelarRef.current?.focus();
          }
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [abierto, onCancelar]);

  if (!abierto) return null;

  const toneCls =
    tono === "peligro"
      ? "bg-red-600 text-white hover:bg-red-700"
      : tono === "primaria"
        ? "bg-teal-600 text-white hover:bg-teal-700"
        : "bg-surface-2 text-text ring-1 ring-border hover:bg-[var(--glass-highlight)]";

  return (
    <div className="fixed inset-0 z-[60]" role="alertdialog" aria-modal="true" aria-label={titulo}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancelar} />
      <div className="glass-panel-strong absolute left-1/2 top-1/3 w-full max-w-sm -translate-x-1/2 rounded-2xl p-4">
        <h3 className="text-sm font-bold text-text">{titulo}</h3>
        <p className="mt-1.5 text-sm text-text-muted">{mensaje}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={btnCancelarRef}
            onClick={onCancelar}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text"
          >
            Cancelar
          </button>
          <button
            ref={btnConfirmarRef}
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
