"use client";

import type { Operario, Rol } from "@/lib/types";
import type { AccionOF } from "@/lib/acciones";
import { agruparPorFase, conTope } from "@/lib/fases-tablero";
import type { Facet } from "./PedidoCard";
import type { LiveInfo } from "./Board";
import { PedidoLinea } from "./PedidoLinea";
import { LiveDot } from "./LiveBadge";
import { ROL } from "@/lib/estado";

/** Cuántos pedidos se ven por fase antes de "+N más". Es lo que garantiza que
 *  el bloque mida lo mismo con 5 pedidos que con 40.
 *
 *  Seis y no tres: con tres, un reparto normal ya mandaba media columna al
 *  desplegable, y abrir un panel para ver el cuarto pedido es trabajo que no
 *  hacía falta. Cada fila mide 26 px, así que seis siguen cabiendo sin que la
 *  zona personal se coma la bandeja. */
const TOPE = 6;

/** La zona del operario actual. Solo pinta las fases con contenido: las vacías
 *  se resumen como contadores en la cabecera, en vez de reservar una columna
 *  cada una (que era lo que gastaba ~270 px para no decir nada). */
export function ZonaPersonal({
  operario,
  facets,
  live,
  onOpen,
  onVerTodos,
  onAccion,
  onFichar,
  onDesfichar,
  completarPedido,
  operarios,
  setRevisor,
  ofIdsFichandoYo,
}: {
  operario: Operario;
  facets: Facet[];
  live?: LiveInfo | null;
  onOpen: (f: Facet) => void;
  /** Saca el pedido a Producción (columna "Listo para pasar"). */
  completarPedido: (pedidoId: string) => void;
  /** Abre el desplegable con todos los pedidos de una fase. */
  onVerTodos: (faseId: string) => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  /** Para nombrar revisor al pasar a revisión desde la fila (ver PedidoLinea). */
  operarios: Operario[];
  setRevisor: (ofId: string, revisorId: string | null) => void;
  /** OFs de mi intervalo abierto; ver el comentario en Board. */
  ofIdsFichandoYo?: ReadonlySet<string>;
}) {
  const grupos = agruparPorFase(facets);
  const conItems = grupos.filter((g) => g.items.length > 0);
  const vacias = grupos.filter((g) => g.items.length === 0);
  const nOFs = facets.reduce((n, f) => n + f.ofs.length, 0);

  return (
    <div
      style={{ borderColor: operario.color }}
      className="glass-panel flex flex-col rounded-2xl border p-3"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className="grid size-7 place-items-center rounded-full text-[11px] font-bold text-white"
          style={{ background: operario.color }}
        >
          {operario.iniciales}
        </span>
        <h2 className="text-sm font-semibold text-text">{operario.nombre}</h2>
        <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-600">
          Tú
        </span>
        <span className="text-[11px] text-text-muted">
          {facets.length} pedido{facets.length === 1 ? "" : "s"} · {nOFs} OF
        </span>

        {/* Fases vacías: contadores diminutos, sin gastar una columna. */}
        {vacias.length > 0 && (
          <span className="flex flex-wrap items-center gap-2 text-[10px] text-text-muted">
            {vacias.map((g) => (
              <span key={g.id} className="flex items-center gap-1">
                <span className="size-1.5 rounded-full" style={{ background: g.color }} />
                0 {g.label.toLowerCase()}
              </span>
            ))}
          </span>
        )}

        {live && (
          <span
            className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold"
            style={{ color: ROL[live.rol].color }}
          >
            <LiveDot rol={live.rol} className="size-1.5" />
            {ROL[live.rol].label} {live.pedido.codigo}
          </span>
        )}
      </div>

      {conItems.length === 0 ? (
        <p className="py-2 text-[11px] text-text-muted">Sin pedidos asignados.</p>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          {conItems.map((g) => {
            const { visibles, resto } = conTope(g.items, TOPE);
            return (
              <div key={g.id} className="min-w-[220px] flex-1">
                <h3 className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-text-muted">
                  <span className="size-1.5 rounded-full" style={{ background: g.color }} />
                  {g.label} · {g.items.length}
                </h3>
                <div className="flex flex-col gap-1">
                  {visibles.map((f) => (
                    <PedidoLinea
                      key={f.pedido.id}
                      facet={f}
                      fase={g.id}
                      onOpen={onOpen}
                      onAccion={onAccion}
                      onFichar={onFichar}
                      onDesfichar={onDesfichar}
                      completarPedido={completarPedido}
                      operarios={operarios}
                      setRevisor={setRevisor}
                      ofIdsFichandoYo={ofIdsFichandoYo}
                    />
                  ))}
                  {resto > 0 && (
                    <button
                      onClick={() => onVerTodos(g.id)}
                      className="rounded-md border border-dashed border-[var(--glass-border)] py-0.5 text-[10px] font-semibold text-text-muted hover:border-brand-400 hover:text-text"
                    >
                      +{resto} más
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
