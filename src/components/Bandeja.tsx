"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Operario } from "@/lib/types";
import { PedidoCard, type Facet } from "./PedidoCard";

export function Bandeja({
  facets,
  operarios,
  onOpen,
}: {
  facets: Facet[];
  operarios: Operario[];
  onOpen: (f: Facet) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "bandeja" });
  const nOFs = facets.reduce((n, f) => n + f.ofs.length, 0);

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border p-3 transition-colors ${
        isOver
          ? "border-brand-400 bg-brand-50/60 dark:bg-brand-900/15"
          : "border-[var(--glass-border)] bg-[var(--glass-bg-strong)]"
      }`}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-text">Sin asignar</h2>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-text-muted ring-1 ring-border">
          {facets.length} ped · {nOFs} OF
        </span>
        <span className="ml-auto text-[11px] text-text-muted">
          Arrastra un parte a un operario
        </span>
      </div>

      {/* rejilla fluida: llena todo el ancho de pantalla sin slider */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {facets.length === 0 ? (
          <div className="col-span-full grid min-h-24 place-items-center rounded-lg border border-dashed border-border text-xs text-text-muted">
            No hay partes sin asignar
          </div>
        ) : (
          facets.map((f) => (
            <PedidoCard
              key={f.pedido.id}
              facet={f}
              operarios={operarios}
              onOpen={onOpen}
              mostrarPrioridad
            />
          ))
        )}
      </div>
    </div>
  );
}
