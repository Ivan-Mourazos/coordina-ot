"use client";

import type { Operario } from "@/lib/types";
import { estadoRepresentativo } from "@/lib/estado";
import type { Facet } from "./PedidoCard";
import { PedidoChip } from "./PedidoChip";

type Bucket = "sinEmpezar" | "planteando" | "revision" | "finalizado";

const GRUPOS: { id: Bucket; label: string }[] = [
  { id: "sinEmpezar", label: "Sin empezar" },
  { id: "planteando", label: "Planteando" },
  { id: "revision", label: "Revisión" },
  { id: "finalizado", label: "Finalizado" },
];

function bucketDe(f: Facet): Bucket {
  const rep = estadoRepresentativo(f.ofs);
  if (rep === "aprobada") return "finalizado";
  if (rep === "por_revisar" || rep === "en_revision") return "revision";
  if (rep === "devuelta") return "planteando";
  const empezada = f.ofs.some((o) => o.tiempoPlanteoMin > 0 || o.fichandoRol);
  return empezada ? "planteando" : "sinEmpezar";
}

/** Partes de un técnico agrupados por en qué punto del ciclo van, en vez de
 *  mostrar el estado en cada tarjeta individual.
 *  - "grid" (por defecto): 4 columnas kanban, para el panel grande del técnico.
 *  - "list": grupos apilados en una sola columna, para desplegar un compañero. */
export function PedidosPorEstado({
  facets,
  operarios,
  onOpen,
  layout = "grid",
  accionFacet,
  accionOF,
  completarPedido,
}: {
  facets: Facet[];
  operarios: Operario[];
  onOpen: (f: Facet) => void;
  layout?: "grid" | "list";
  accionFacet: (facet: Facet, accion: any, obs?: string, revisorId?: string) => void;
  accionOF: (ofId: string, accion: any, obs?: string) => void;
  completarPedido: (pedidoId: string) => void;
}) {
  const grupos = GRUPOS.map((g) => ({
    ...g,
    items: facets.filter((f) => bucketDe(f) === g.id),
  }));

  if (layout === "list") {
    // Solo grupos con contenido; cada uno un subtítulo y sus pedidos apilados.
    const conItems = grupos.filter((g) => g.items.length > 0);
    if (conItems.length === 0) {
      return <p className="py-1 text-[11px] text-text-muted">Sin partes asignados.</p>;
    }
    return (
      <div className="flex flex-col gap-3">
        {conItems.map((g) => (
          <div key={g.id} className="flex flex-col gap-1.5">
            <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              {g.label}
              <span className="rounded-full bg-[var(--glass-highlight)] px-1.5 text-[9px] tabular-nums">
                {g.items.length}
              </span>
            </h3>
            <div className="flex flex-col gap-1.5">
              {g.items.map((f) => (
                <PedidoChip
                  key={f.pedido.id}
                  facet={f}
                  operarios={operarios}
                  onOpen={onOpen}
                  accionFacet={accionFacet}
                  completarPedido={completarPedido}
                  bucket={g.id}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
      {grupos.map((g) => (
        <div key={g.id} className="flex flex-col gap-1.5">
          <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            {g.label}
            <span className="rounded-full bg-[var(--glass-highlight)] px-1.5 text-[9px] tabular-nums">
              {g.items.length}
            </span>
          </h3>
          <div className="flex flex-1 flex-col gap-1.5">
            {g.items.length === 0 ? (
              <div className="grid min-h-10 w-full place-items-center rounded-lg border border-dashed border-[var(--glass-border)] text-[10px] text-text-muted">
                —
              </div>
            ) : (
              g.items.map((f) => (
                <PedidoChip
                  key={f.pedido.id}
                  facet={f}
                  operarios={operarios}
                  onOpen={onOpen}
                  accionFacet={accionFacet}
                  accionOF={accionOF}
                  completarPedido={completarPedido}
                  bucket={g.id}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
