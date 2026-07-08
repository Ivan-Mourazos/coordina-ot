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
        <span className="text-base leading-none">📥</span>
        <h2 className="text-base font-bold text-text">Sin asignar</h2>
        <span className="rounded-full bg-brand-500/15 px-2.5 py-0.5 text-[11px] font-bold text-brand-400">
          {facets.length} ped · {nOFs} OF
        </span>
      </div>

      {grupos.length === 0 ? (
        <div className="grid min-h-24 place-items-center rounded-lg border border-dashed border-border text-xs text-text-muted">
          No hay partes sin asignar
        </div>
      ) : (
        /* Galería de cajas: cada fecha es una caja con relieve 3D que ocupa
           solo lo que necesita; con 1 pedido no desperdicia toda la fila. */
        <div className="flex flex-wrap items-start gap-3">
          {grupos.map((g) => (
            <div
              key={g.fecha}
              className={`bandeja-caja w-fit max-w-full rounded-2xl p-2.5 ${
                g.vencida ? "bandeja-caja-tarde" : ""
              }`}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <h3
                  className={`text-xs font-bold uppercase tracking-wide ${
                    g.vencida ? "text-red-500" : "text-text"
                  }`}
                >
                  {g.etiqueta}
                </h3>
                <span className="ml-auto rounded-full bg-[var(--glass-highlight)] px-1.5 text-[10px] font-semibold text-text-muted">
                  {g.facets.length}
                </span>
              </div>
              <div className="flex max-w-[560px] flex-wrap gap-1.5">
                {g.facets.map((f) => (
                  <div key={f.pedido.id} className="w-[80px]">
                    <PedidoCard
                      facet={f}
                      operarios={operarios}
                      onOpen={onOpen}
                      mostrarPrioridad
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
