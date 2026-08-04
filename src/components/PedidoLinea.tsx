"use client";

import type { Rol } from "@/lib/types";
import type { Facet } from "./PedidoCard";
import { FASES, type Fase } from "@/lib/fases-tablero";
import { accionPrimariaDePedido, ofsFichablesDe, ofsPara } from "@/lib/accion-pedido";
import { rolFichajeDe } from "@/lib/fichaje";
import { fmtMin } from "@/lib/estado";
import type { AccionOF } from "@/lib/acciones";

/** Una línea por pedido: código, cliente, descripción y nº de OF. El detalle
 *  largo sale al abrir el pedido; aquí manda que quepan muchos sin crecer.
 *
 *  Las acciones se revelan al pasar el ratón para no gastar sitio en reposo.
 *  La excepción es la pausa del pedido que se está fichando: está siempre
 *  visible porque es la que más se pulsa y esconderla obligaría a buscarla.
 *
 *  El borde izquierdo lleva el color de la fase, salvo en urgentes, que lo
 *  pintan en rojo: la prioridad tiene que verse sin leer. */
export function PedidoLinea({
  facet,
  fase,
  onOpen,
  onAccion,
  onFichar,
  onDesfichar,
  completarPedido,
}: {
  facet: Facet;
  fase: Fase;
  onOpen: (f: Facet) => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  completarPedido: (pedidoId: string) => void;
}) {
  const { pedido, ofs } = facet;
  const urgente = pedido.prioridad === 3;
  const fichando = ofs.find((o) => o.fichandoRol);
  const minutos = ofs.reduce((n, o) => n + o.tiempoPlanteoMin + o.tiempoRevisionMin, 0);
  const color = urgente ? "#dc2626" : FASES.find((f) => f.id === fase)?.color;
  const descripcion = ofs[0]?.descripcion ?? "";

  const accion = accionPrimariaDePedido(facet);
  const fichables = ofsFichablesDe(facet);

  return (
    <div
      style={{ borderLeftColor: color }}
      className={`group flex items-center gap-2 rounded-lg border border-l-[3px] border-[var(--glass-border)] px-2 py-1 text-[11px] transition-colors hover:border-brand-400 ${
        fichando ? "bg-emerald-500/10" : "bg-surface-2/60"
      }`}
    >
      <button
        onClick={() => onOpen(facet)}
        title={`${pedido.codigo} · ${pedido.cliente} · ${descripcion}`}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        {fichando && (
          <span className="size-1.5 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30" />
        )}
        <b className="shrink-0 font-semibold tabular-nums text-text">{pedido.codigo}</b>
        <span className="min-w-0 flex-1 truncate text-text-muted">
          {pedido.cliente}
          {descripcion && ` · ${descripcion}`}
        </span>
        <span className="shrink-0 text-[10px] text-text-muted">
          {ofs.length} OF{minutos > 0 && ` · ${fmtMin(minutos)}`}
        </span>
      </button>

      <span className="flex shrink-0 items-center gap-1">
        {/* Pausa: siempre visible mientras se ficha. */}
        {fichando ? (
          <button
            onClick={() => onDesfichar(fichando.id)}
            title="Pausar el fichaje"
            className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700"
          >
            Pausar
          </button>
        ) : (
          fichables.length > 0 && (
            <button
              onClick={() => onFichar(fichables.map((o) => o.id), rolFichajeDe(fichables[0]))}
              title="Empezar a fichar en este pedido"
              className="rounded px-1.5 py-0.5 text-[10px] font-bold text-text-muted opacity-0 transition-opacity hover:bg-[var(--glass-highlight)] hover:text-text focus:opacity-100 group-hover:opacity-100"
            >
              Fichar
            </button>
          )
        )}

        {accion && (
          <button
            onClick={() => onAccion(ofsPara(facet, accion.id).map((o) => o.id), accion.id)}
            title={accion.label}
            className="rounded bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold text-white opacity-0 transition-opacity hover:bg-brand-600 focus:opacity-100 group-hover:opacity-100"
          >
            {accion.label}
          </button>
        )}

        {fase === "listoParaPasar" && (
          <button
            onClick={() => completarPedido(pedido.id)}
            title="Pasar el pedido a Producción"
            className="rounded bg-cyan-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-cyan-700"
          >
            Pasar
          </button>
        )}
      </span>
    </div>
  );
}
