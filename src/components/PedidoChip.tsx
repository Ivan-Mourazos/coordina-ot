"use client";

import { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { Operario } from "@/lib/types";
import { dragIdOf, type Facet } from "./PedidoCard";
import { FamiliaIcon } from "./FamiliaTag";
import { LiveDot } from "./LiveBadge";
import { ROL } from "@/lib/estado";

/** Ficha compacta de un pedido dentro del panel de un técnico. Muestra lo
 *  mínimo para identificarlo (código, cliente, nº de OF) y abre el detalle
 *  al clic; el estado ya lo da la columna donde vive. Arrastrable para
 *  reasignar, igual que la tarjeta grande. */
export const PedidoChip = memo(function PedidoChip({
  facet,
  operarios,
  onOpen,
}: {
  facet: Facet;
  operarios: Operario[];
  onOpen: (f: Facet) => void;
}) {
  const { pedido, ofs } = facet;
  const total = pedido.ofs.length;
  const parcial = ofs.length < total;
  const familias = [...new Set(ofs.map((o) => o.familia))];

  const fichando = ofs.find((o) => o.fichandoRol);
  const revisorId = ofs.find((o) => o.revisorId)?.revisorId ?? null;
  const revisor = operarios.find((o) => o.id === revisorId) ?? null;
  const atrasado = Boolean(facet.atrasado);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragIdOf(facet),
    data: { facet },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(facet)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(facet);
        }
      }}
      className={`glass-chip group flex w-full cursor-grab items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-shadow active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
        isDragging ? "opacity-30" : ""
      } ${atrasado ? "ring-1 ring-red-500/70" : ""}`}
    >
      {fichando?.fichandoRol && (
        <span title={`${ROL[fichando.fichandoRol].label} ahora`} className="inline-flex shrink-0">
          <LiveDot rol={fichando.fichandoRol} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`truncate text-xs font-semibold leading-tight ${
              atrasado ? "text-red-600" : "text-text"
            }`}
          >
            {pedido.codigo}
          </span>
          {atrasado && (
            <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-red-600">
              ¡Tarde!
            </span>
          )}
        </div>
        <div className="truncate text-[10px] leading-tight text-text-muted">
          {pedido.cliente}
        </div>
      </div>

      <span className="flex shrink-0 items-center gap-0.5">
        {familias.slice(0, 3).map((f) => (
          <FamiliaIcon key={f} familia={f} className="size-3" />
        ))}
      </span>

      {revisor && (
        <span
          className="grid size-5 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
          style={{ background: revisor.color }}
          title={`Revisa: ${revisor.nombre}`}
        >
          {revisor.iniciales}
        </span>
      )}

      <span className="shrink-0 rounded-md bg-[var(--glass-highlight)] px-1.5 py-0.5 text-[9px] font-semibold text-text-muted">
        {parcial ? `${ofs.length}/${total}` : total} OF
      </span>
    </div>
  );
});
