"use client";

import { useEffect, useRef } from "react";
import type { Rol } from "@/lib/types";
import type { AccionOF } from "@/lib/acciones";
import { agruparPorFase } from "@/lib/fases-tablero";
import type { Facet } from "./PedidoCard";
import { PedidoLinea } from "./PedidoLinea";

/** Todos los pedidos de una fase, flotando sobre el tablero.
 *
 *  Flota en vez de empujar: si creciera el bloque, la página daría un salto y
 *  se perdería el alto que acabamos de ganar. Mismo comportamiento que el
 *  panel de compañero, para no tener dos formas distintas de "ver más". */
export function FaseFlyout({
  facets,
  faseId,
  onOpen,
  onClose,
  onAccion,
  onFichar,
  onDesfichar,
  completarPedido,
}: {
  facets: Facet[];
  faseId: string;
  onOpen: (f: Facet) => void;
  onClose: () => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  completarPedido: (pedidoId: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
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
  }, [onClose]);

  const grupo = agruparPorFase(facets).find((g) => g.id === faseId);
  if (!grupo) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center pt-24">
      <div
        ref={ref}
        style={{ background: "var(--surface)" }}
        className="glass-pop scroll-thin max-h-[60vh] w-[min(32rem,92vw)] overflow-y-auto rounded-xl p-3"
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: grupo.color }} />
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
            {grupo.label} · {grupo.items.length}
          </h3>
          <button
            onClick={onClose}
            className="ml-auto text-[10px] font-semibold text-text-muted hover:text-text"
          >
            Cerrar · Esc
          </button>
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
            />
          ))}
        </div>
      </div>
    </div>
  );
}
