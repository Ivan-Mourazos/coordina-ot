"use client";

import { memo, useState, type CSSProperties } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { Operario } from "@/lib/types";
import { dragIdOf, type Facet } from "./PedidoCard";
import { LiveDot } from "./LiveBadge";
import { ROL } from "@/lib/estado";
import { PedidoScan } from "./PedidoScan";
import { Select, OpDot } from "./Select";
import type { AccionOF } from "./Drawer";

/** Ficha compacta de un pedido dentro del panel de un técnico. Muestra lo
 *  mínimo para identificarlo (código, cliente, nº de OF) y abre el detalle
 *  al clic; el estado ya lo da la columna donde vive. Arrastrable para
 *  reasignar, igual que la tarjeta grande. */
export const PedidoChip = memo(function PedidoChip({
  facet,
  operarios,
  onOpen,
  accionFacet,
  accionOF,
  completarPedido,
  bucket,
  raised = false,
}: {
  facet: Facet;
  operarios: Operario[];
  onOpen: (f: Facet) => void;
  accionFacet?: (facet: Facet, accion: AccionOF, obs?: string, revisorId?: string) => void;
  accionOF?: (ofId: string, accion: AccionOF, obs?: string) => void;
  completarPedido?: (pedidoId: string) => void;
  bucket?: "sinEmpezar" | "planteando" | "revision" | "finalizado";
  raised?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [terminando, setTerminando] = useState(false);
  const [revisorSelect, setRevisorSelect] = useState<string | null>(null);
  const { pedido, ofs } = facet;
  const total = pedido.ofs.length;
  const parcial = ofs.length < total;

  const fichando = ofs.find((o) => o.fichandoRol);
  const revisorId = ofs.find((o) => o.revisorId)?.revisorId ?? null;
  const revisor = operarios.find((o) => o.id === revisorId) ?? null;
  const atrasado = Boolean(facet.atrasado);
  const accent =
    bucket === "planteando"
      ? "#059669"
      : bucket === "revision"
        ? "#f59e0b"
        : bucket === "finalizado"
          ? "#0d9488"
          : "#9ca3af";

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragIdOf(facet),
    data: { facet },
  });

  return (
    <div
      ref={setNodeRef}
      style={raised ? ({ "--pedido-accent": accent } as CSSProperties) : undefined}
      className={`group flex w-full flex-col overflow-hidden rounded-lg focus-within:ring-2 focus-within:ring-brand-400 ${
        raised
          ? `pedido-chip-3d ${expanded ? "pedido-chip-3d-open" : ""}`
          : "glass-chip transition-shadow"
      } ${
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
                if (of.estado === "en_curso" && autor) infoEstado = `Planteando`;
                else if (of.estado === "en_revision" && rev) infoEstado = `Revisando`;
                else if (of.estado === "aprobada") infoEstado = "Finalizada";
                else if (of.estado === "por_revisar") infoEstado = "Para revisar";

                return (
                  <div key={of.id} className="flex items-center justify-between gap-2 text-[10px] leading-tight group/of">
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="font-semibold text-text truncate">
                        {of.codigo} - {of.descripcion}
                      </span>
                      <div className="flex items-center gap-1 text-text-muted truncate">
                        {of.fichandoRol && <LiveDot rol={of.fichandoRol} className="size-1.5 shrink-0" />}
                        <span>{infoEstado}</span>
                        {of.tiempoPlanteoMin > 0 && <span>· Plant: {of.tiempoPlanteoMin}m</span>}
                        {of.tiempoRevisionMin > 0 && <span>· Rev: {of.tiempoRevisionMin}m</span>}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0">
                      {autor && (
                        <div className="size-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white shadow-sm ring-1 ring-black/10" style={{ background: autor.color }} title={`Plantea: ${autor.nombre}`}>
                          {autor.iniciales}
                        </div>
                      )}
                      {rev && (
                        <div className="size-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white shadow-sm ring-1 ring-black/10" style={{ background: rev.color }} title={`Revisa: ${rev.nombre}`}>
                          {rev.iniciales}
                        </div>
                      )}
                      
                      {of.estado === "pendiente" && accionOF && (
                        <button
                          onClick={(e) => { e.stopPropagation(); accionOF(of.id, "anular"); }}
                          className="rounded px-1.5 py-0.5 text-[9px] font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors opacity-0 group-hover/of:opacity-100 focus:opacity-100"
                          title="Anular OF (no se hace en OT)"
                        >
                          Anular
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-[var(--glass-border)] pt-2">
                {bucket === "sinEmpezar" && accionFacet && (
                  <button
                    onClick={(e) => { e.stopPropagation(); accionFacet(facet, "empezar"); }}
                    className="rounded bg-teal-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-teal-700"
                  >
                    ▶ Empezar a plantear
                  </button>
                )}

                {bucket === "planteando" && accionFacet && !terminando && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setTerminando(true); }}
                      className="rounded bg-amber-500 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-amber-600"
                    >
                      ✔ Terminar de plantear
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); accionFacet(facet, "deshacer_empezar"); }}
                      className="rounded bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-text hover:bg-surface-3"
                    >
                      ↩ Deshacer (Volver a Sin Empezar)
                    </button>
                  </>
                )}

                {bucket === "planteando" && accionFacet && terminando && (
                  <div className="flex w-full items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] text-text-muted">Revisor:</span>
                    <div className="flex-1">
                      <Select
                        value={revisorSelect}
                        onChange={setRevisorSelect}
                        options={operarios.filter(o => o.id !== facet.locationId).map(o => ({ value: o.id, label: o.nombre, icon: <OpDot color={o.color} iniciales={o.iniciales} /> }))}
                        placeholder="Elegir..."
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (revisorSelect) {
                          accionFacet(facet, "terminar", undefined, revisorSelect);
                          setTerminando(false);
                        }
                      }}
                      disabled={!revisorSelect}
                      className="rounded bg-teal-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => setTerminando(false)}
                      className="rounded bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-text hover:bg-surface-3"
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {bucket === "revision" && (
                  <span className="rounded bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                    Esperando revisión del compañero
                  </span>
                )}

                {bucket === "finalizado" && completarPedido && (
                  <button
                    onClick={(e) => { e.stopPropagation(); completarPedido(pedido.id); }}
                    className="rounded bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700"
                  >
                    📦 Pasar a Producción (Completar)
                  </button>
                )}

                <button
                  onClick={(e) => { e.stopPropagation(); onOpen(facet); }}
                  className="ml-auto rounded bg-white/50 px-2 py-1 text-[10px] font-semibold hover:bg-white/80 dark:bg-black/20 dark:hover:bg-black/40"
                >
                  Abrir detalles ↗
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
