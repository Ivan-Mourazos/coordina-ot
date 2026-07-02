"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { OF, Operario, Pedido } from "@/lib/types";
import { PedidoScan } from "./PedidoScan";
import { QuickLook } from "./QuickLook";
import { FamiliaIcon } from "./FamiliaTag";
import { LiveDot } from "./LiveBadge";
import { ROL } from "@/lib/estado";
import { familiaMeta } from "@/lib/familia";

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

/** Parte visual (reutilizada por la tarjeta y por el DragOverlay). El ancho
 *  lo pone el grid contenedor (tarjeta fluida, sin slider de tamaño). */
export const PedidoCardView = memo(function PedidoCardView({
  facet,
  operarios,
  dragging = false,
  mostrarPrioridad = false,
}: {
  facet: Facet;
  operarios: Operario[];
  dragging?: boolean;
  /** Muestra prioridad + atrasado junto al código (pensado para la bandeja
   *  "Sin asignar", donde no hay agrupación por estado que ya lo indique). */
  mostrarPrioridad?: boolean;
}) {
  const { pedido, ofs } = facet;
  const total = pedido.ofs.length;
  const parcial = ofs.length < total;

  const fichando = ofs.find((o) => o.fichandoRol);
  const revisorId = ofs.find((o) => o.revisorId)?.revisorId ?? null;
  const revisor = operarios.find((o) => o.id === revisorId) ?? null;
  const atrasado = Boolean(facet.atrasado);
  const familias = [...new Set(ofs.map((o) => o.familia))];

  return (
    <div className="w-full select-none">
      <div
        className={`relative aspect-[210/297] w-full rounded-md bg-white shadow-sm ring-1 transition-shadow ${
          dragging
            ? "shadow-xl ring-brand-400"
            : "ring-black/10 hover:shadow-lg dark:ring-white/10"
        } ${atrasado ? "outline outline-2 outline-offset-2 outline-red-500/80" : ""}`}
      >
        <PedidoScan pedido={pedido} />

        {/* familias: para saber QUÉ es antes de cogerlo */}
        <span className="absolute left-1 top-1 flex flex-col gap-0.5">
          {familias.slice(0, 3).map((f) => (
            <span
              key={f}
              title={familiaMeta(f).label}
              className="grid size-5 place-items-center rounded-[5px] bg-white/95 shadow-sm ring-1 ring-black/10"
            >
              <FamiliaIcon familia={f} className="size-3.5" />
            </span>
          ))}
        </span>



        {/* fichando ahora, con el color del rol */}
        {fichando?.fichandoRol && (
          <span
            className="absolute bottom-1 left-1 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow"
            style={{ background: ROL[fichando.fichandoRol].color }}
          >
            <LiveDot rol={fichando.fichandoRol} className="size-1.5" />
            {fichando.fichandoRol === "revisar" ? "Revisando" : "Planteando"}
          </span>
        )}
      </div>

      {/* pie con datos */}
      <div className="mt-1 px-0.5">
        <div className="flex items-center gap-1">
          <span
            className={`truncate font-mono text-sm font-bold leading-tight ${
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
      </div>
    </div>
  );
});

/** Tarjeta arrastrable + clic para abrir detalle + Quick Look al mantener
 *  el ratón (vista previa grande de la 1ª hoja del pedido). */
export const PedidoCard = memo(function PedidoCard({
  facet,
  operarios,
  onOpen,
  mostrarPrioridad = false,
}: {
  facet: Facet;
  operarios: Operario[];
  onOpen: (f: Facet) => void;
  mostrarPrioridad?: boolean;
}) {
  const id = dragIdOf(facet);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { facet },
  });

  const [peek, setPeek] = useState<DOMRect | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  function cancelPeek() {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setPeek(null);
  }
  useEffect(() => cancelPeek, []);
  useEffect(() => {
    if (isDragging) cancelPeek();
  }, [isDragging]);

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        rootRef.current = el;
      }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(facet)}
      onMouseEnter={() => {
        hoverTimer.current = window.setTimeout(() => {
          const rect = rootRef.current?.getBoundingClientRect();
          if (rect) setPeek(rect);
        }, 350);
      }}
      onMouseLeave={cancelPeek}
      onMouseDown={cancelPeek}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(facet);
        }
      }}
      className={`cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      <PedidoCardView facet={facet} operarios={operarios} mostrarPrioridad={mostrarPrioridad} />
      {peek && !isDragging && <QuickLook pedido={facet.pedido} anchor={peek} />}
    </div>
  );
});
