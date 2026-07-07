"use client";

import type { Operario, Rol } from "@/lib/types";
import type { Facet } from "./PedidoCard";
import { PedidoChip } from "./PedidoChip";
import type { AccionOF } from "@/lib/acciones";

type Bucket = "sinEmpezar" | "planteando" | "revision" | "finalizado";

const GRUPOS: { id: Bucket; label: string }[] = [
  { id: "sinEmpezar", label: "Sin empezar" },
  { id: "planteando", label: "Planteando" },
  { id: "revision", label: "Para revisar" },
  { id: "finalizado", label: "Finalizado" },
];

function bucketDe(f: Facet): Bucket {
  const todasAprobadas = f.ofs.every((o) => o.estado === "aprobada");
  if (todasAprobadas) return "finalizado";

  const hayQuePlantear = f.ofs.some(
    (o) =>
      o.estado === "en_curso" ||
      o.estado === "devuelta" ||
      o.fichandoRol === "plantear",
  );
  if (hayQuePlantear) return "planteando";

  const todasSinEmpezar = f.ofs.every(
    (o) => o.estado === "pendiente" && o.tiempoPlanteoMin === 0 && !o.fichandoRol,
  );
  if (todasSinEmpezar) return "sinEmpezar";

  const listoParaRevisor = f.ofs.some(
    (o) => o.estado === "por_revisar" || o.estado === "en_revision",
  );
  if (listoParaRevisor) return "revision";

  return "planteando";
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
  raisedCards = false,
  accionable = true,
  onAccion,
  onFichar,
  onDesfichar,
  setRevisor,
  completarPedido,
}: {
  facets: Facet[];
  operarios: Operario[];
  onOpen: (f: Facet) => void;
  layout?: "grid" | "list";
  raisedCards?: boolean;
  /** false = panel de un compañero: chips informativos, sin acciones. */
  accionable?: boolean;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  setRevisor: (ofId: string, revisorId: string | null) => void;
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
                  onAccion={onAccion}
                  onFichar={onFichar}
                  onDesfichar={onDesfichar}
                  setRevisor={setRevisor}
                  completarPedido={completarPedido}
                  bucket={g.id}
                  raised={raisedCards}
                  accionable={accionable}
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
                  onAccion={onAccion}
                  onFichar={onFichar}
                  onDesfichar={onDesfichar}
                  setRevisor={setRevisor}
                  completarPedido={completarPedido}
                  bucket={g.id}
                  raised={raisedCards}
                  accionable={accionable}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
