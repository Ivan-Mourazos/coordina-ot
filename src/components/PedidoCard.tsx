"use client";

import { useDraggable } from "@dnd-kit/core";
import type { OF, Operario, Pedido } from "@/lib/types";
import { OtPaper } from "./OtPaper";

const BASE_W = 152; // px a tamaño 1.0

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
  mostrarPrioridad = false,
}: {
  facet: Facet;
  size: number;
  operarios: Operario[];
  dragging?: boolean;
  /** Muestra prioridad + atrasado junto al código (pensado para la bandeja
   *  "Sin asignar", donde no hay agrupación por estado que ya lo indique). */
  mostrarPrioridad?: boolean;
}) {
  const { pedido, ofs } = facet;
  const w = Math.round(BASE_W * size);
  const h = Math.round(w * 1.414);
  const total = pedido.ofs.length;
  const parcial = ofs.length < total;

  const fichando = ofs.find((o) => o.fichandoRol);
  const revisorId = ofs.find((o) => o.revisorId)?.revisorId ?? null;
  const revisor = operarios.find((o) => o.id === revisorId) ?? null;
  const atrasado = Boolean(facet.atrasado);

  return (
    <div style={{ width: w }} className="select-none">
      <div
        style={{ height: h }}
        className={`relative rounded-md bg-paper shadow-sm border-2 transition-shadow ${
          dragging
            ? "shadow-xl border-brand-400"
            : fichando
              ? "border-emerald-400 hover:shadow-md"
              : "border-border hover:shadow-md"
        } ${atrasado ? "ring-2 ring-red-500 ring-offset-1 ring-offset-zone" : ""}`}
      >
        <OtPaper pedido={pedido} />

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
      </div>

      {/* pie con datos */}
      <div className="mt-1 px-0.5">
        <div className="flex items-center gap-1">
          {mostrarPrioridad && (
            <span
              className={`shrink-0 text-[10px] font-bold ${atrasado ? "text-red-600" : "text-text-muted"}`}
            >
              P{pedido.prioridad}
            </span>
          )}
          <span
            className={`truncate text-[11px] font-semibold leading-tight ${
              mostrarPrioridad && atrasado ? "text-red-600" : "text-text"
            }`}
          >
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
  mostrarPrioridad = false,
}: {
  facet: Facet;
  size: number;
  operarios: Operario[];
  onOpen: () => void;
  mostrarPrioridad?: boolean;
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
      <PedidoCardView facet={facet} size={size} operarios={operarios} mostrarPrioridad={mostrarPrioridad} />
    </div>
  );
}
