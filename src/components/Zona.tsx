"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { Operario, Rol } from "@/lib/types";
import { ROL } from "@/lib/estado";
import type { Facet } from "./PedidoCard";
import type { LiveInfo } from "./Board";
import { PedidosPorEstado } from "./PedidosPorEstado";
import { LiveDot } from "./LiveBadge";
import type { AccionOF } from "@/lib/acciones";

// Resumen de OFs por fase para el panel contraído.
const RESUMEN = [
  { label: "Sin empezar", color: "#9ca3af" },
  { label: "Planteando", color: "#059669" },
  { label: "Para revisar", color: "#7c3aed" },
  { label: "Finalizado", color: "#0d9488" },
] as const;

function faseIdx(of: { estado: string; tiempoPlanteoMin: number; fichandoRol: unknown }): number {
  if (of.estado === "aprobada") return 3;
  if (of.estado === "por_revisar" || of.estado === "en_revision") return 2;
  if (of.estado === "en_curso" || of.estado === "devuelta") return 1;
  return of.tiempoPlanteoMin > 0 || of.fichandoRol ? 1 : 0;
}

export function Zona({
  operario,
  operarios,
  facets,
  live,
  soyYo = false,
  onOpen,
  onAccion,
  onFichar,
  onDesfichar,
  setRevisor,
  completarPedido,
}: {
  operario: Operario;
  operarios: Operario[];
  facets: Facet[];
  /** Si este técnico está fichando ahora mismo (y en qué). */
  live?: LiveInfo | null;
  /** Destaca esta zona como la del técnico actual (panel grande de Asignar). */
  soyYo?: boolean;
  onOpen: (f: Facet) => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  setRevisor: (ofId: string, revisorId: string | null) => void;
  completarPedido: (pedidoId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: operario.id });
  const nOFs = facets.reduce((n, f) => n + f.ofs.length, 0);
  const [colapsada, setColapsada] = useState(false);

  // Recuento de OFs por fase para el resumen del panel contraído.
  const porFase = RESUMEN.map((r, i) => ({
    ...r,
    n: facets.reduce((n, f) => n + f.ofs.filter((o) => faseIdx(o) === i).length, 0),
  }));

  return (
    <div
      ref={setNodeRef}
      style={soyYo && !isOver ? { borderColor: operario.color } : undefined}
      className={`glass-panel relative flex flex-col rounded-2xl p-4 transition-colors ${
        isOver ? "border-brand-400 bg-brand-50/60 dark:bg-brand-900/15" : ""
      }`}
    >
      {/* handle estilo iOS: contrae/expande mi panel. Centrado arriba. */}
      <button
        onClick={() => setColapsada((v) => !v)}
        aria-expanded={!colapsada}
        aria-label={colapsada ? "Expandir mi panel" : "Contraer mi panel"}
        title={colapsada ? "Expandir" : "Contraer"}
        className="group absolute left-1/2 top-1 flex -translate-x-1/2 flex-col items-center gap-0.5 rounded-full px-4 py-1"
      >
        <span className="h-1 w-9 rounded-full bg-text-muted/30 transition-colors group-hover:bg-text-muted/60" />
        <svg
          viewBox="0 0 24 24"
          className={`size-3 text-text-muted/50 transition-transform group-hover:text-text-muted ${colapsada ? "" : "rotate-180"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="mb-3 flex items-center gap-2">
        <span
          className={`grid place-items-center rounded-full font-bold text-white ${
            soyYo ? "size-8 text-xs" : "size-6 text-[10px]"
          }`}
          style={{ background: operario.color }}
        >
          {operario.iniciales}
        </span>
        <h2 className={`font-semibold text-text ${soyYo ? "text-base" : "text-sm"}`}>
          {operario.nombre}
        </h2>
        {soyYo && (
          <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-600">
            Tú
          </span>
        )}
        {live && (
          <span
            className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ color: ROL[live.rol].color, background: `${ROL[live.rol].color}1a` }}
            title={`${ROL[live.rol].label} ${live.pedido.codigo} · ${live.of.descripcion}`}
          >
            <LiveDot rol={live.rol} className="size-1.5" />
            {ROL[live.rol].label} {live.pedido.codigo}
          </span>
        )}
        <span className="ml-auto rounded-full bg-[var(--glass-highlight)] px-2 py-0.5 text-[11px] font-medium text-text-muted">
          {facets.length} ped · {nOFs} OF
        </span>
      </div>

      {colapsada ? (
        /* Resumen: cuántas OF hay en cada fase, sin ocupar sitio. */
        <div className="flex flex-wrap items-center gap-2">
          {porFase.every((f) => f.n === 0) ? (
            <span className="text-xs text-text-muted">Sin pedidos asignados.</span>
          ) : (
            porFase
              .filter((f) => f.n > 0)
              .map((f) => (
                <span
                  key={f.label}
                  className="flex items-center gap-1.5 rounded-lg bg-surface-2/70 px-2.5 py-1 text-xs font-medium text-text"
                >
                  <span className="size-2 rounded-full" style={{ background: f.color }} />
                  {f.label}
                  <b className="tabular-nums">{f.n}</b>
                </span>
              ))
          )}
        </div>
      ) : (
        /* Altura acotada con scroll interno: con muchos pedidos la zona no
            estira la página y deja ver la bandeja de abajo. */
        <div className="scroll-thin max-h-[42vh] overflow-y-auto pr-1">
          <PedidosPorEstado
            facets={facets}
            operarios={operarios}
            onOpen={onOpen}
            onAccion={onAccion}
            onFichar={onFichar}
            onDesfichar={onDesfichar}
            setRevisor={setRevisor}
            completarPedido={completarPedido}
            raisedCards={soyYo}
          />
        </div>
      )}
    </div>
  );
}
