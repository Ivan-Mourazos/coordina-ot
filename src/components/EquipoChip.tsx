"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Operario } from "@/lib/types";
import type { Facet } from "./PedidoCard";
import { PedidosPorEstado } from "./PedidosPorEstado";

/** Chip compacto de un compañero: ocupa poco en la fila de Equipo. Es zona
 *  droppable (mismo id que Zona, el drag&drop no cambia) y, al pulsar el
 *  nombre, despliega sus partes en un panel flotante hacia abajo — así ver
 *  el trabajo de un compañero no roba sitio a la bandeja Sin asignar. */
export function EquipoChip({
  operario,
  operarios,
  facets,
  expanded,
  onToggle,
  onOpen,
}: {
  operario: Operario;
  operarios: Operario[];
  facets: Facet[];
  expanded: boolean;
  onToggle: () => void;
  onOpen: (f: Facet) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: operario.id });
  const nOFs = facets.reduce((n, f) => n + f.ofs.length, 0);

  return (
    <div ref={setNodeRef} className="relative w-full sm:w-[210px]">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className={`glass-panel flex w-full items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-left transition-colors ${
          isOver ? "border-brand-400 bg-brand-50/60 dark:bg-brand-900/15" : ""
        } ${expanded ? "ring-1 ring-brand-400" : ""}`}
      >
        <span
          className="grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
          style={{ background: operario.color }}
        >
          {operario.iniciales}
        </span>
        <span className="truncate text-xs font-medium text-text">{operario.nombre}</span>
        <span className="ml-auto shrink-0 rounded-full bg-[var(--glass-highlight)] px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
          {facets.length}·{nOFs}
        </span>
        <svg
          viewBox="0 0 24 24"
          className={`size-3 shrink-0 text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div className="absolute left-0 top-full z-20 mt-1.5 max-h-[46vh] w-64 overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-xl scroll-thin">
          <PedidosPorEstado facets={facets} operarios={operarios} onOpen={onOpen} layout="list" />
        </div>
      )}
    </div>
  );
}
