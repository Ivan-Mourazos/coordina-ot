"use client";

import { useCallback, useMemo, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { Operario, Prioridad } from "@/lib/types";
import { PRIORIDAD } from "@/lib/estado";
import { familiaMeta } from "@/lib/familia";
import { FamiliaIcon } from "./FamiliaTag";
import { PedidoCard, type Facet } from "./PedidoCard";
import type { Orden } from "./FilterBar";

/* ── helpers de orden ── */

/** Prioridad desc, luego fecha asc. */
function cmpPrioFecha(a: Facet, b: Facet) {
  const pa = PRIORIDAD[a.pedido.prioridad].rank;
  const pb = PRIORIDAD[b.pedido.prioridad].rank;
  if (pa !== pb) return pb - pa;
  return a.pedido.fechaPlanificacion.localeCompare(b.pedido.fechaPlanificacion);
}

/** Fecha asc, luego prioridad desc. */
function cmpFechaPrio(a: Facet, b: Facet) {
  const d = a.pedido.fechaPlanificacion.localeCompare(b.pedido.fechaPlanificacion);
  if (d !== 0) return d;
  return PRIORIDAD[b.pedido.prioridad].rank - PRIORIDAD[a.pedido.prioridad].rank;
}

/* ── scroll horizontal arrastrable ── */

function useGrabScroll() {
  const ref = useRef<HTMLDivElement | null>(null);
  const state = useRef({ down: false, startX: 0, scrollLeft: 0 });

  const onDown = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    state.current = { down: true, startX: e.pageX, scrollLeft: el.scrollLeft };
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
  }, []);

  const onMove = useCallback((e: React.MouseEvent) => {
    if (!state.current.down) return;
    const el = ref.current;
    if (!el) return;
    el.scrollLeft = state.current.scrollLeft - (e.pageX - state.current.startX);
  }, []);

  const onUp = useCallback(() => {
    state.current.down = false;
    const el = ref.current;
    if (el) {
      el.style.cursor = "grab";
      el.style.userSelect = "";
    }
  }, []);

  return { ref, onDown, onMove, onUp, onLeave: onUp };
}

/* ── fila con scroll horizontal (usada por Familia y Prioridad) ── */

function ScrollRow({
  label,
  icon,
  count,
  color,
  facets,
  operarios,
  onOpen,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  color?: string;
  facets: Facet[];
  operarios: Operario[];
  onOpen: (f: Facet) => void;
}) {
  const { ref, onDown, onMove, onUp, onLeave } = useGrabScroll();

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        {icon}
        <span className="text-xs font-bold text-text" style={color ? { color } : undefined}>
          {label}
        </span>
        <span className="rounded-full bg-[var(--glass-highlight)] px-1.5 text-[10px] font-semibold text-text-muted">
          {count}
        </span>
      </div>
      <div
        ref={ref}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onLeave}
        className="scroll-thin flex gap-1.5 overflow-x-auto pb-1"
        style={{ cursor: "grab" }}
      >
        {facets.map((f) => (
          <div key={f.pedido.id} className="w-[80px] shrink-0">
            <PedidoCard
              facet={f}
              operarios={operarios}
              onOpen={onOpen}
              mostrarPrioridad
              mostrarFecha
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── componente principal ── */

export function Bandeja({
  facets,
  operarios,
  onOpen,
  orden = "planificacion",
}: {
  facets: Facet[];
  operarios: Operario[];
  onOpen: (f: Facet) => void;
  orden?: Orden;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "bandeja" });
  const nOFs = facets.reduce((n, f) => n + f.ofs.length, 0);

  /* ── modo flat (planificación) ── */
  const flat = useMemo(
    () => [...facets].sort(cmpFechaPrio),
    [facets],
  );

  /* ── modo familia ── */
  const filasFamilia = useMemo(() => {
    const map = new Map<string, Facet[]>();
    for (const f of facets) {
      const fam = f.ofs[0]?.familia ?? "OTRO";
      const arr = map.get(fam);
      if (arr) arr.push(f);
      else map.set(fam, [f]);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([fam, items]) => ({
        familia: fam,
        meta: familiaMeta(fam),
        facets: items.sort(cmpPrioFecha),
      }));
  }, [facets]);

  /* ── modo prioridad ── */
  const filasPrioridad = useMemo(() => {
    const map = new Map<Prioridad, Facet[]>();
    for (const f of facets) {
      const p = f.pedido.prioridad;
      const arr = map.get(p);
      if (arr) arr.push(f);
      else map.set(p, [f]);
    }
    return ([3, 2, 1] as Prioridad[])
      .filter((p) => map.has(p))
      .map((p) => ({
        prioridad: p,
        meta: PRIORIDAD[p],
        facets: (map.get(p) ?? []).sort((a, b) =>
          a.pedido.fechaPlanificacion.localeCompare(b.pedido.fechaPlanificacion),
        ),
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

      {facets.length === 0 ? (
        <div className="grid min-h-24 place-items-center rounded-lg border border-dashed border-border text-xs text-text-muted">
          No hay partes sin asignar
        </div>
      ) : orden === "planificacion" ? (
        /* ── FLAT: tarjetas seguidas, fecha en cada una ── */
        <div className="flex flex-wrap gap-1.5">
          {flat.map((f) => (
            <div key={f.pedido.id} className="w-[80px]">
              <PedidoCard
                facet={f}
                operarios={operarios}
                onOpen={onOpen}
                mostrarPrioridad
                mostrarFecha
              />
            </div>
          ))}
        </div>
      ) : orden === "familia" ? (
        /* ── FILAS POR FAMILIA ── */
        <div className="space-y-3">
          {filasFamilia.map((fila) => (
            <ScrollRow
              key={fila.familia}
              label={fila.meta.label}
              icon={<FamiliaIcon familia={fila.familia} className="size-4" />}
              count={fila.facets.length}
              facets={fila.facets}
              operarios={operarios}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : orden === "prioridad" ? (
        /* ── FILAS POR PRIORIDAD ── */
        <div className="space-y-3">
          {filasPrioridad.map((fila) => (
            <ScrollRow
              key={fila.prioridad}
              label={fila.meta.label}
              icon={
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: fila.meta.color }}
                />
              }
              count={fila.facets.length}
              color={fila.meta.color}
              facets={fila.facets}
              operarios={operarios}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : (
        /* fallback: flat */
        <div className="flex flex-wrap gap-1.5">
          {flat.map((f) => (
            <div key={f.pedido.id} className="w-[80px]">
              <PedidoCard
                facet={f}
                operarios={operarios}
                onOpen={onOpen}
                mostrarPrioridad
                mostrarFecha
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
