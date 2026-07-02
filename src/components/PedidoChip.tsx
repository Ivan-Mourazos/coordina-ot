"use client";

import { memo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { Operario } from "@/lib/types";
import { dragIdOf, type Facet } from "./PedidoCard";
import { LiveDot } from "./LiveBadge";
import { ROL } from "@/lib/estado";
import { PedidoScan } from "./PedidoScan";

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
  const [expanded, setExpanded] = useState(false);
  const { pedido, ofs } = facet;
  const total = pedido.ofs.length;
  const parcial = ofs.length < total;

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
      className={`glass-chip group flex w-full flex-col overflow-hidden rounded-lg transition-shadow focus-within:ring-2 focus-within:ring-brand-400 ${
        isDragging ? "opacity-30" : ""
      } ${atrasado ? "ring-1 ring-red-500/70" : ""}`}
    >
      <div
        {...attributes}
        {...listeners}
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((x) => !x);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((x) => !x);
          }
        }}
        className="flex w-full cursor-grab items-center gap-2 px-2.5 py-2 text-left active:cursor-grabbing focus:outline-none"
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
          <div className="mt-0.5 truncate text-[10px] italic text-text-muted/80">
            {ofs.map((o) => o.descripcion).join(" · ")}
          </div>
        </div>

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

        <svg
          viewBox="0 0 24 24"
          className={`size-3 shrink-0 text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {expanded && (
        <div className="border-t border-[var(--glass-border)] bg-[var(--glass-highlight)] p-2.5 cursor-default">
          <div className="flex gap-3">
            <div
              className="aspect-[210/297] w-16 shrink-0 overflow-hidden rounded bg-white shadow-sm ring-1 ring-black/10 cursor-pointer hover:ring-brand-400 transition-shadow"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(facet);
              }}
              title="Ver detalle del pedido"
            >
              <PedidoScan pedido={pedido} />
            </div>

            <div className="flex flex-1 flex-col gap-2">
              {ofs.map((of) => {
                const autor = operarios.find((x) => x.id === of.autorId);
                const rev = operarios.find((x) => x.id === of.revisorId);
                let infoEstado = "Sin empezar";
                if (of.estado === "en_curso" && autor) infoEstado = `Planteando: ${autor.nombre}`;
                else if (of.estado === "en_revision" && rev) infoEstado = `Revisando: ${rev.nombre}`;
                else if (of.estado === "aprobada") infoEstado = "Completada";
                else if (of.estado === "por_revisar") infoEstado = "Pendiente de revisar";

                return (
                  <div key={of.id} className="flex flex-col gap-0.5 text-[10px] leading-tight">
                    <span className="font-semibold text-text">
                      {of.codigo} - {of.descripcion}
                    </span>
                    <div className="flex items-center justify-between text-text-muted">
                      <span className="flex items-center gap-1">
                        {of.fichandoRol && <LiveDot rol={of.fichandoRol} className="size-1.5" />}
                        {infoEstado}
                      </span>
                      <span>
                        {of.tiempoPlanteoMin > 0 && `Plant: ${of.tiempoPlanteoMin}m`}
                        {of.tiempoRevisionMin > 0 && ` · Rev: ${of.tiempoRevisionMin}m`}
                      </span>
                    </div>
                  </div>
                );
              })}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(facet);
                }}
                className="mt-1 w-fit rounded bg-white/50 px-2 py-1 text-[10px] font-semibold hover:bg-white/80 dark:bg-black/20 dark:hover:bg-black/40"
              >
                Abrir detalles ↗
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
