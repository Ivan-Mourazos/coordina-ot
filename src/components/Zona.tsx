"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Operario, Rol } from "@/lib/types";
import { ROL } from "@/lib/estado";
import type { Facet } from "./PedidoCard";
import type { LiveInfo } from "./Board";
import { PedidosPorEstado } from "./PedidosPorEstado";
import { LiveDot } from "./LiveBadge";
import type { AccionOF } from "@/lib/acciones";

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

  return (
    <div
      ref={setNodeRef}
      style={soyYo && !isOver ? { borderColor: operario.color } : undefined}
      className={`glass-panel flex flex-col rounded-2xl p-4 transition-colors ${
        isOver ? "border-brand-400 bg-brand-50/60 dark:bg-brand-900/15" : ""
      }`}
    >
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

      {/* Altura acotada con scroll interno: con muchos pedidos la zona no
          estira la página y deja ver la bandeja de abajo. */}
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
    </div>
  );
}
