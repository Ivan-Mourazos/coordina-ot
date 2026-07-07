"use client";

import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { Operario } from "@/lib/types";
import { hoyISO } from "@/lib/types";
import { PRIORIDAD } from "@/lib/estado";
import { PedidoCard, type Facet } from "./PedidoCard";

const FMT_GRUPO = new Intl.DateTimeFormat("es-ES", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "2026-07-15" → "mar 15 jul". Fecha inválida → "Sin planificar". */
function etiquetaFecha(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "Sin planificar";
  const t = FMT_GRUPO.format(new Date(y, m - 1, d));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

interface Grupo {
  fecha: string;
  etiqueta: string;
  vencida: boolean;
  facets: Facet[];
}

export function Bandeja({
  facets,
  operarios,
  onOpen,
}: {
  facets: Facet[];
  operarios: Operario[];
  onOpen: (f: Facet) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "bandeja" });
  const nOFs = facets.reduce((n, f) => n + f.ofs.length, 0);

  // Agrupado por fecha de planificación (asc). Dentro de cada día, primero lo
  // más urgente (prioridad 3) y a igualdad, por código de pedido.
  const grupos = useMemo<Grupo[]>(() => {
    const hoy = hoyISO();
    const porFecha = new Map<string, Facet[]>();
    for (const f of facets) {
      const fecha = f.pedido.fechaPlanificacion;
      const arr = porFecha.get(fecha);
      if (arr) arr.push(f);
      else porFecha.set(fecha, [f]);
    }
    return [...porFecha.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fecha, items]) => ({
        fecha,
        etiqueta: etiquetaFecha(fecha),
        vencida: fecha < hoy,
        facets: items.sort((a, b) => {
          const pa = PRIORIDAD[a.pedido.prioridad].rank;
          const pb = PRIORIDAD[b.pedido.prioridad].rank;
          if (pa !== pb) return pb - pa; // urgente primero
          return a.pedido.codigo.localeCompare(b.pedido.codigo);
        }),
      }));
  }, [facets]);

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border p-3 transition-colors ${
        isOver
          ? "border-brand-400 bg-brand-50/60 dark:bg-brand-900/15"
          : "border-[var(--glass-border)] bg-[var(--glass-bg-strong)]"
      }`}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-text">Sin asignar</h2>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-text-muted ring-1 ring-border">
          {facets.length} ped · {nOFs} OF
        </span>
        <span className="ml-auto text-[11px] text-text-muted">
          Arrastra un parte a un operario
        </span>
      </div>

      {grupos.length === 0 ? (
        <div className="grid min-h-24 place-items-center rounded-lg border border-dashed border-border text-xs text-text-muted">
          No hay partes sin asignar
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grupos.map((g) => (
            <div key={g.fecha}>
              {/* separador de fecha sticky: se queda visible al hacer scroll */}
              <div
                className={`sticky top-0 z-10 mb-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 backdrop-blur ${
                  g.vencida ? "bg-red-500/10" : "bg-surface/70"
                }`}
              >
                <h3
                  className={`text-[11px] font-bold uppercase tracking-wide ${
                    g.vencida ? "text-red-600" : "text-text"
                  }`}
                >
                  {g.etiqueta}
                  {g.vencida && " · atrasado"}
                </h3>
                <span className="rounded-full bg-[var(--glass-highlight)] px-1.5 text-[10px] text-text-muted">
                  {g.facets.length}
                </span>
                <div className="h-px flex-1 bg-[var(--glass-border)]" />
              </div>
              {/* rejilla fluida: tarjetas pequeñas (el QuickLook amplía al pasar) */}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(116px,1fr))] gap-2">
                {g.facets.map((f) => (
                  <PedidoCard
                    key={f.pedido.id}
                    facet={f}
                    operarios={operarios}
                    onOpen={onOpen}
                    mostrarPrioridad
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
