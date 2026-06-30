"use client";

import { useDraggable } from "@dnd-kit/core";
import type { OF, Operario, Pedido } from "@/lib/types";
import { ESTADO, estadoRepresentativo } from "@/lib/estado";
import { OtPaper } from "./OtPaper";

const BASE_W = 152; // px a tamaño 1.0

const PRIO = {
  1: { label: "P1", bg: "#d23b3b" },
  2: { label: "P2", bg: "#d39a1c" },
  3: { label: "P3", bg: "#6b7280" },
} as const;

export interface Facet {
  pedido: Pedido;
  /** ubicación actual: id de operario autor, o null = bandeja */
  locationId: string | null;
  ofs: OF[];
  /** pasó la fecha de planificación y no está finalizado */
  atrasado?: boolean;
}

export function dragIdOf(f: Facet) {
  return `${f.pedido.id}::${f.locationId ?? "none"}`;
}

/** Parte visual (reutilizada por la tarjeta y por el DragOverlay). */
export function PedidoCardView({
  facet,
  size,
  operarios,
  dragging = false,
}: {
  facet: Facet;
  size: number;
  operarios: Operario[];
  dragging?: boolean;
}) {
  const { pedido, ofs } = facet;
  const w = Math.round(BASE_W * size);
  const h = Math.round(w * 1.414);
  const total = pedido.ofs.length;
  const parcial = ofs.length < total;
  const prio = PRIO[pedido.prioridad];
  const rep = estadoRepresentativo(ofs);
  const meta = ESTADO[rep];

  const fichando = ofs.find((o) => o.fichandoRol);
  const revisorId = ofs.find((o) => o.revisorId)?.revisorId ?? null;
  const revisor = operarios.find((o) => o.id === revisorId) ?? null;
  const atrasado = Boolean(facet.atrasado);

  return (
    <div style={{ width: w }} className="select-none">
      <div
        style={{ height: h }}
        className={`relative rounded-md bg-paper shadow-sm border-2 transition-shadow ${
          dragging ? "shadow-xl border-brand-400" : `${meta.border} hover:shadow-md`
        } ${atrasado ? "ring-2 ring-red-500 ring-offset-1 ring-offset-zone" : ""}`}
      >
        <OtPaper pedido={pedido} />

        {/* atrasado: pasó la planificación sin finalizar */}
        {atrasado && (
          <span className="absolute left-1/2 top-1.5 -translate-x-1/2 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow">
            Atrasado
          </span>
        )}

        {/* prioridad */}
        <span
          className="absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-white shadow"
          style={{ background: prio.bg }}
        >
          {prio.label}
        </span>

        {/* nº de OF */}
        {total > 1 && (
          <span className="absolute right-1.5 top-1.5 rounded bg-text/85 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
            {parcial ? `${ofs.length}/${total}` : total} OF
          </span>
        )}

        {/* fichando ahora (plantea / revisa) */}
        {fichando && (
          <span className="absolute left-1.5 bottom-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
            {fichando.fichandoRol === "revisar" ? "Revisa" : "Plantea"}
          </span>
        )}

        {/* estado */}
        <span
          className={`absolute right-1.5 bottom-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase shadow ${meta.chip}`}
        >
          {meta.short}
        </span>
      </div>

      {/* pie con datos */}
      <div className="mt-1 px-0.5">
        <div className="flex items-center gap-1">
          <span className="truncate text-[11px] font-semibold leading-tight text-text">
            {pedido.codigo}
          </span>
          {revisor && (
            <span
              className="ml-auto flex shrink-0 items-center gap-0.5 rounded-full px-1 text-[9px] font-bold text-white"
              style={{ background: revisor.color }}
              title={`Revisa: ${revisor.nombre}`}
            >
              <span className="opacity-80">rev</span>
              {revisor.iniciales}
            </span>
          )}
        </div>
        <div className="truncate text-[10px] leading-tight text-text-muted">
          {pedido.cliente}
        </div>
      </div>
    </div>
  );
}

/** Tarjeta arrastrable + clic para abrir detalle. */
export function PedidoCard({
  facet,
  size,
  operarios,
  onOpen,
}: {
  facet: Facet;
  size: number;
  operarios: Operario[];
  onOpen: () => void;
}) {
  const id = dragIdOf(facet);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { facet },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`cursor-grab active:cursor-grabbing focus:outline-none ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      <PedidoCardView facet={facet} size={size} operarios={operarios} />
    </div>
  );
}
