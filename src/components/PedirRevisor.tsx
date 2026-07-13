"use client";

import { useState } from "react";
import type { Operario } from "@/lib/types";
import { Select, OpDot } from "./Select";

/** Selector inline de revisor que acompaña a "Pasar a revisión": el revisor
 *  se nombra en el momento de pasar la OF, no con un botón suelto. Mismo
 *  componente en el chip del tablero y en el Drawer para que el flujo sea
 *  idéntico en todas partes. El autor nunca puede ser el revisor. */
export function PedirRevisor({
  operarios,
  excluirIds,
  valorInicial = null,
  etiquetaConfirmar = "Confirmar",
  onConfirmar,
  onCancelar,
}: {
  operarios: Operario[];
  /** Ids que no pueden revisar (autores de las OFs afectadas). */
  excluirIds: (string | null)[];
  /** Revisor ya asignado, si lo hay (p.ej. una devuelta que vuelve a revisión). */
  valorInicial?: string | null;
  etiquetaConfirmar?: string;
  onConfirmar: (revisorId: string) => void;
  onCancelar: () => void;
}) {
  const [revisorId, setRevisorId] = useState<string | null>(valorInicial);
  const excluidos = new Set(excluirIds.filter(Boolean) as string[]);

  return (
    <div className="flex w-full items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <span className="text-[10px] text-text-muted">Revisor:</span>
      <div className="flex-1">
        <Select
          value={revisorId}
          onChange={setRevisorId}
          options={operarios
            .filter((o) => !excluidos.has(o.id))
            .map((o) => ({
              value: o.id,
              label: o.nombre,
              icon: <OpDot color={o.color} iniciales={o.iniciales} />,
            }))}
          placeholder="Elegir…"
        />
      </div>
      <button
        onClick={() => revisorId && onConfirmar(revisorId)}
        disabled={!revisorId}
        className="rounded bg-teal-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {etiquetaConfirmar}
      </button>
      <button
        onClick={onCancelar}
        className="rounded bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-text hover:bg-surface-3"
      >
        Cancelar
      </button>
    </div>
  );
}
