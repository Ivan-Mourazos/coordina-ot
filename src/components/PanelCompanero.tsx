"use client";

import type { Operario, Rol } from "@/lib/types";
import type { AccionOF } from "@/lib/acciones";
import { agruparPorFase } from "@/lib/fases-tablero";
import { ROL } from "@/lib/estado";
import type { Facet } from "./PedidoCard";
import type { LiveInfo } from "./Board";
import { PedidoLinea } from "./PedidoLinea";
import { LiveDot } from "./LiveBadge";
import { PanelFlotante } from "./PanelFlotante";

/** El trabajo de un compañero, con la MISMA forma que tu propia zona: cuatro
 *  fases en columnas y una línea por pedido. Que se lea igual es el punto —
 *  antes era un popup estrecho con otro formato, y comparar dos personas
 *  obligaba a traducir mentalmente entre dos maneras de enseñar lo mismo.
 *
 *  Es de SOLO CONSULTA: sobre el trabajo de otro no se ficha ni se cambia de
 *  estado ni se reasigna nada. Cada pedido lleva un candado con el motivo
 *  (ver motivoBloqueo en lib/fases-tablero.ts), y el contenedor hace scroll
 *  (PanelFlotante) en vez de recortar la lista: se ve todo lo que tiene. */
export function PanelCompanero({
  operario,
  facets,
  live,
  onOpen,
  onCerrar,
  onAccion,
  onFichar,
  onDesfichar,
  completarPedido,
}: {
  operario: Operario;
  facets: Facet[];
  live: LiveInfo | null;
  onOpen: (f: Facet) => void;
  onCerrar: () => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  completarPedido: (pedidoId: string) => void;
}) {
  const grupos = agruparPorFase(facets);
  const conItems = grupos.filter((g) => g.items.length > 0);
  const nOFs = facets.reduce((n, f) => n + f.ofs.length, 0);

  return (
    <PanelFlotante onCerrar={onCerrar}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className="grid size-7 place-items-center rounded-full text-[11px] font-bold text-white"
          style={{ background: operario.color }}
        >
          {operario.iniciales}
        </span>
        <h2 className="text-sm font-semibold text-text">{operario.nombre}</h2>
        <span className="text-[11px] text-text-muted">
          {facets.length} pedido{facets.length === 1 ? "" : "s"} · {nOFs} OF
        </span>

        {live && (
          <span
            className="flex items-center gap-1.5 text-[11px] font-semibold"
            style={{ color: ROL[live.rol].color }}
          >
            <LiveDot rol={live.rol} className="size-1.5" />
            {ROL[live.rol].label} {live.pedido.codigo}
          </span>
        )}

        <button
          onClick={onCerrar}
          className="ml-auto rounded-lg px-2 py-0.5 text-[10px] font-semibold text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
        >
          Cerrar · Esc
        </button>
      </div>

      {conItems.length === 0 ? (
        <p className="py-2 text-[11px] text-text-muted">Sin pedidos asignados.</p>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          {conItems.map((g) => (
            <div key={g.id} className="min-w-[240px] flex-1">
              <h3 className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-text-muted">
                <span className="size-1.5 rounded-full" style={{ background: g.color }} />
                {g.label} · {g.items.length}
              </h3>
              {/* Sin tope: el contenedor (PanelFlotante) ya hace scroll con
                  max-h-[60vh], así que recortar aquí solo escondería pedidos
                  que el scroll podría alcanzar igualmente. */}
              <div className="flex flex-col gap-1">
                {g.items.map((f) => (
                  <PedidoLinea
                    key={f.pedido.id}
                    facet={f}
                    fase={g.id}
                    onOpen={onOpen}
                    onAccion={onAccion}
                    onFichar={onFichar}
                    onDesfichar={onDesfichar}
                    completarPedido={completarPedido}
                    soloConsulta
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PanelFlotante>
  );
}
