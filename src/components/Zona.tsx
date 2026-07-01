"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Operario } from "@/lib/types";
import type { Facet } from "./PedidoCard";
import { PedidosPorEstado } from "./PedidosPorEstado";

export function Zona({
  operario,
  operarios,
  facets,
  soyYo = false,
  onOpen,
}: {
  operario: Operario;
  operarios: Operario[];
  facets: Facet[];
  /** Destaca esta zona como la del técnico actual (panel grande de Asignar). */
  soyYo?: boolean;
  onOpen: (f: Facet) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: operario.id });
  const nOFs = facets.reduce((n, f) => n + f.ofs.length, 0);

  return (
    <div
      ref={setNodeRef}
      style={soyYo && !isOver ? { borderColor: operario.color } : undefined}
      className={`glass-panel flex flex-col rounded-2xl p-4 transition-colors ${
        isOver ? "border-brand-400 bg-brand-50/60 dark:bg-brand-900/15" : ""
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`grid place-items-center rounded-full font-bold text-white ${
            soyYo ? "size-8 text-xs" : "size-6 text-[10px]"
          }`}
          style={{ background: operario.color }}
        >
          {operario.iniciales}
        </span>
        <h2 className={`font-semibold text-text ${soyYo ? "text-base" : "text-sm"}`}>
          {operario.nombre}
        </h2>
        {soyYo && (
          <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-600">
            Tú
          </span>
        )}
        <span className="ml-auto rounded-full bg-[var(--glass-highlight)] px-2 py-0.5 text-[11px] font-medium text-text-muted">
          {facets.length} ped · {nOFs} OF
        </span>
      </div>

      <PedidosPorEstado facets={facets} operarios={operarios} onOpen={onOpen} />
    </div>
  );
}
