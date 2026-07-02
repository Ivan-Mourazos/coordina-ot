"use client";

import { memo, useEffect, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { OF, Operario } from "@/lib/types";
import { ROL } from "@/lib/estado";
import type { Facet } from "./PedidoCard";
import { PedidosPorEstado } from "./PedidosPorEstado";
import { LiveDot } from "./LiveBadge";
import type { LiveInfo } from "./Board";
import type { AccionOF } from "./Drawer";

// En qué fase está cada OF, para la barra de distribución del técnico.
const FASES = [
  { id: "sin", label: "Sin empezar", color: "#9ca3af" },
  { id: "planteo", label: "Planteando", color: "#059669" },
  { id: "revision", label: "Para revisar", color: "#7c3aed" },
  { id: "ok", label: "Finalizado", color: "#0d9488" },
] as const;

function faseDe(of: OF): (typeof FASES)[number]["id"] {
  if (of.estado === "aprobada") return "ok";
  if (of.estado === "por_revisar" || of.estado === "en_revision") return "revision";
  if (of.estado === "devuelta") return "planteo";
  return of.tiempoPlanteoMin > 0 || of.fichandoRol ? "planteo" : "sin";
}

/** Tarjeta compacta de un compañero: nombre, si está fichando AHORA (y con
 *  qué rol), y una barra con la distribución de sus OF por fase. Zona
 *  droppable (arrastra un parte encima para asignárselo). Al pulsar,
 *  despliega sus partes agrupados sin robar sitio a la bandeja. */
export const TecnicoCard = memo(function TecnicoCard({
  operario,
  operarios,
  facets,
  live,
  expanded,
  onToggle,
  onClose,
  onOpen,
  accionFacet,
  accionOF,
  completarPedido,
}: {
  operario: Operario;
  operarios: Operario[];
  facets: Facet[];
  live: LiveInfo | null;
  expanded: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpen: (f: Facet) => void;
  accionFacet: (facet: Facet, accion: AccionOF, obs?: string, revisorId?: string) => void;
  accionOF: (ofId: string, accion: AccionOF, obs?: string) => void;
  completarPedido: (pedidoId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: operario.id });
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Desplegado: se cierra con clic fuera o Escape (igual que los selects).
  useEffect(() => {
    if (!expanded) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded, onClose]);

  const ofs = facets.flatMap((f) => f.ofs);
  const porFase = FASES.map((fase) => ({
    ...fase,
    n: ofs.filter((o) => faseDe(o) === fase.id).length,
  }));

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        rootRef.current = el;
      }}
      className="relative min-w-[230px] flex-1"
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className={`glass-panel w-full rounded-xl px-3 py-2 text-left transition-colors ${
          isOver ? "border-brand-400 bg-brand-50/60 dark:bg-brand-900/15" : ""
        } ${expanded ? "ring-1 ring-brand-400" : ""}`}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
            style={{ background: operario.color }}
          >
            {operario.iniciales}
          </span>
          <span className="truncate text-xs font-semibold text-text">{operario.nombre}</span>

          {live ? (
            <span
              className="ml-auto flex min-w-0 shrink items-center gap-1 text-[10px] font-bold"
              style={{ color: ROL[live.rol].color }}
              title={`${ROL[live.rol].label} ${live.pedido.codigo} · ${live.of.descripcion}`}
            >
              <LiveDot rol={live.rol} className="size-1.5" />
              <span className="truncate">{ROL[live.rol].label}</span>
            </span>
          ) : (
            <span className="ml-auto text-[10px] text-text-muted">
              {facets.length} ped · {ofs.length} OF
            </span>
          )}

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

        {/* barra de distribución por fase */}
        <div
          className="mt-1.5 flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-[var(--glass-highlight)]"
          title={porFase.filter((f) => f.n).map((f) => `${f.label}: ${f.n} OF`).join(" · ")}
        >
          {ofs.length > 0 &&
            porFase
              .filter((f) => f.n > 0)
              .map((f) => (
                <span
                  key={f.id}
                  className="h-full rounded-full"
                  style={{ width: `${(f.n / ofs.length) * 100}%`, background: f.color }}
                />
              ))}
        </div>
      </button>

      {expanded && (
        <div className="glass-pop scroll-thin absolute left-0 top-full z-20 mt-1.5 max-h-[46vh] w-full min-w-72 overflow-y-auto rounded-xl p-3">
          <PedidosPorEstado 
            facets={facets} 
            operarios={operarios} 
            onOpen={onOpen} 
            layout="list" 
            accionFacet={accionFacet}
            accionOF={accionOF}
            completarPedido={completarPedido}
          />
        </div>
      )}
    </div>
  );
});
