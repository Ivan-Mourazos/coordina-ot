"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Operario } from "@/lib/types";
import { PedidoCard, type Facet } from "./PedidoCard";

export function Zona({
  operario,
  operarios,
  facets,
  size,
  onOpen,
}: {
  operario: Operario;
  operarios: Operario[];
  facets: Facet[];
  size: number;
  onOpen: (f: Facet) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: operario.id });
  const nOFs = facets.reduce((n, f) => n + f.ofs.length, 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border bg-zone p-3 transition-colors ${
        isOver ? "border-brand-400 bg-brand-50/60 dark:bg-brand-900/15" : "border-border"
      }`}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className="grid size-6 place-items-center rounded-full text-[10px] font-bold text-white"
          style={{ background: operario.color }}
        >
          {operario.iniciales}
        </span>
        <h2 className="text-sm font-semibold text-text">{operario.nombre}</h2>
        <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-text-muted ring-1 ring-border">
          {facets.length} ped · {nOFs} OF
        </span>
      </div>

      <div className="flex flex-1 flex-wrap content-start gap-3">
        {facets.length === 0 ? (
          <div className="grid min-h-24 w-full place-items-center rounded-lg border border-dashed border-border text-xs text-text-muted">
            Arrastra aquí
          </div>
        ) : (
          facets.map((f) => (
            <PedidoCard
              key={f.pedido.id}
              facet={f}
              size={size}
              operarios={operarios}
              onOpen={() => onOpen(f)}
            />
          ))
        )}
      </div>
    </div>
  );
}
