"use client";

import type { Operario, Rol } from "@/lib/types";
import type { AccionOF } from "@/lib/acciones";
import { agruparPorFase } from "@/lib/fases-tablero";
import type { Facet } from "./PedidoCard";
import { PedidoLinea } from "./PedidoLinea";
import { BotonCerrarPanel, PanelFlotante } from "./PanelFlotante";

/** Todos los pedidos de una fase, para cuando el tope de la zona personal deja
 *  algunos fuera. El comportamiento (sitio, fondo, cierre) lo pone
 *  PanelFlotante, compartido con el panel de compañero. */
export function FaseFlyout({
  facets,
  faseId,
  onOpen,
  onClose,
  onAccion,
  onFichar,
  onDesfichar,
  completarPedido,
  operarios,
  setRevisor,
  ofIdsFichandoYo,
}: {
  facets: Facet[];
  faseId: string;
  onOpen: (f: Facet) => void;
  onClose: () => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  completarPedido: (pedidoId: string) => void;
  /** Para nombrar revisor al pasar a revisión desde la fila (ver PedidoLinea). */
  operarios: Operario[];
  setRevisor: (ofId: string, revisorId: string | null) => void;
  /** OFs de mi intervalo abierto; ver el comentario en Board. */
  ofIdsFichandoYo?: ReadonlySet<string>;
}) {
  const grupo = agruparPorFase(facets).find((g) => g.id === faseId);
  if (!grupo) return null;

  return (
    <PanelFlotante onCerrar={onClose}>
      <div className="mb-2 flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: grupo.color }} />
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
          {grupo.label} · {grupo.items.length}
        </h3>
        {/* Del contexto y no del `onClose` de arriba: ese desmonta el panel en
            seco y se saltaría la animación de salida. */}
        <BotonCerrarPanel className="ml-auto" />
      </div>
      <div className="flex flex-col gap-1">
        {grupo.items.map((f) => (
          <PedidoLinea
            key={f.pedido.id}
            facet={f}
            fase={grupo.id}
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
      </div>
    </PanelFlotante>
  );
}
