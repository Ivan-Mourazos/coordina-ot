"use client";

import { useCallback, useMemo, useRef } from "react";
import type { Operario, Prioridad } from "@/lib/types";
import { PRIORIDAD } from "@/lib/estado";
import { familiaMeta } from "@/lib/familia";
import { FamiliaIcon } from "./FamiliaTag";
import { PedidoCard, type Facet } from "./PedidoCard";

/* ── cómo se reparten las tarjetas ── */

/** Lo que hace este panel con el desplegable NO es ordenar, es partir la
 *  bandeja en filas. Se llamaba `Orden` y venía de FilterBar, que además traía
 *  valores ajenos ("entrega", "cliente") que aquí no pintaban nada y caían a un
 *  fallback mudo: tres valores propios y cerrados dicen la verdad. */
export type Agrupacion = "ninguna" | "familia" | "prioridad";

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
  claveGrupo,
  label,
  icon,
  count,
  color,
  facets,
  operarios,
  onOpen,
  onAsignar,
  miId,
}: {
  /** Identidad de la fila (familia o prioridad). Entra en la key de cada
   *  tarjeta porque agrupando por familia el mismo pedido sale en varias filas
   *  y `pedido.id` a secas ya no identifica a cuál pertenece la tarjeta. */
  claveGrupo: string;
  label: string;
  icon: React.ReactNode;
  count: number;
  color?: string;
  facets: Facet[];
  operarios: Operario[];
  onOpen: (f: Facet) => void;
  onAsignar?: (f: Facet, operarioId: string) => void;
  miId?: string | null;
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
          <div key={`${claveGrupo}:${f.pedido.id}`} className="w-[80px] shrink-0">
            <PedidoCard
              facet={f}
              operarios={operarios}
              onOpen={onOpen}
              onAsignar={onAsignar}
              miId={miId}
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
  onAsignar,
  miId,
  agrupar = "ninguna",
  hayFiltrosActivos = false,
}: {
  facets: Facet[];
  operarios: Operario[];
  onOpen: (f: Facet) => void;
  onAsignar?: (f: Facet, operarioId: string) => void;
  miId?: string | null;
  agrupar?: Agrupacion;
  /** Si la barra de arriba está recortando. Con 0 partes cambia el mensaje:
   *  "no hay nada" y "no hay nada que pase el filtro" no son lo mismo. */
  hayFiltrosActivos?: boolean;
}) {
  const nOFs = facets.reduce((n, f) => n + f.ofs.length, 0);

  /* ── sin agrupar ── */
  const flat = useMemo(
    () => [...facets].sort(cmpFechaPrio),
    [facets],
  );

  /* ── agrupado por familia ── */
  const filasFamilia = useMemo(() => {
    const map = new Map<string, Facet[]>();
    for (const f of facets) {
      // Un pedido con una OF de toldo y otra de lona sale en LAS DOS filas,
      // cada una con solo sus OF. Antes se miraba `ofs[0].familia` y el pedido
      // entero caía en toldo: quien vigilaba la fila "Lona" no veía trabajo que
      // sí era suyo. Estrechar `ofs` es lo mismo que hace la Lista al filtrar.
      for (const fam of new Set(f.ofs.map((o) => o.familia))) {
        const trozo: Facet = { ...f, ofs: f.ofs.filter((o) => o.familia === fam) };
        const arr = map.get(fam);
        if (arr) arr.push(trozo);
        else map.set(fam, [trozo]);
      }
    }
    return [...map.entries()]
      .map(([fam, items]) => ({
        familia: fam,
        meta: familiaMeta(fam),
        facets: items.sort(cmpPrioFecha),
      }))
      // Antes las filas iban por número de pedidos: un criterio que nadie
      // adivinaba mirándolas y que solo decía qué montón era más alto. Ahora
      // manda la urgencia — como cada fila ya está ordenada, su primer parte es
      // el más urgente que contiene, y ese decide el orden entre filas.
      .sort((a, b) => cmpPrioFecha(a.facets[0], b.facets[0]));
  }, [facets]);

  /* ── agrupado por prioridad ── */
  // Aquí no hay que partir nada: la prioridad es del pedido, no de cada OF, así
  // que un parte cae en una fila y solo en una. Y las filas van 3→2→1, que se
  // lee solo — a diferencia de familia, este orden no hacía falta cambiarlo.
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
      className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] p-3"
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-base leading-none">📥</span>
        <h2 className="text-base font-bold text-text">Sin asignar</h2>
        <span className="rounded-full bg-brand-500/15 px-2.5 py-0.5 text-[11px] font-bold text-brand-700 dark:text-brand-300">
          {facets.length} ped · {nOFs} OF
        </span>
      </div>

      {facets.length === 0 ? (
        /* Decir "no hay partes sin asignar" cuando lo que pasa es que los
           filtros se los han comido es mentir: manda a buscar un problema que
           no existe (o a dar por hecho que no queda trabajo). */
        <div className="grid min-h-24 place-items-center rounded-lg border border-dashed border-border text-xs text-text-muted">
          {hayFiltrosActivos
            ? "Hay partes sin asignar, pero ninguno pasa los filtros actuales"
            : "No hay partes sin asignar"}
        </div>
      ) : agrupar === "familia" ? (
        /* ── FILAS POR FAMILIA ── */
        <div className="space-y-3">
          {filasFamilia.map((fila) => (
            <ScrollRow
              key={fila.familia}
              claveGrupo={fila.familia}
              label={fila.meta.label}
              icon={<FamiliaIcon familia={fila.familia} className="size-4" />}
              count={fila.facets.length}
              facets={fila.facets}
              operarios={operarios}
              onOpen={onOpen}
              onAsignar={onAsignar}
              miId={miId}
            />
          ))}
        </div>
      ) : agrupar === "prioridad" ? (
        /* ── FILAS POR PRIORIDAD ── */
        <div className="space-y-3">
          {filasPrioridad.map((fila) => (
            <ScrollRow
              key={fila.prioridad}
              claveGrupo={String(fila.prioridad)}
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
              onAsignar={onAsignar}
              miId={miId}
            />
          ))}
        </div>
      ) : (
        /* ── SIN AGRUPAR: tarjetas seguidas, fecha en cada una. Va de última
             rama, no de primera con un fallback igual detrás: `Agrupacion`
             tiene tres valores y ya no hay ningún cuarto caso que cubrir. ── */
        /* Rejilla que se reparte el ancho, no tarjetas de 80 px que dejan un
           hueco a la derecha. `auto-fill` mete las que quepan a 80 px mínimo y
           `1fr` les da el sobrante a partes iguales: con 21 por fila, en vez de
           una franja muerta al final cada tarjeta crece un pelín. El PDF de
           dentro escala con ella, así que se lee mejor cuanto más ancha. */
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}
        >
          {flat.map((f) => (
            <div key={f.pedido.id} className="min-w-0">
              <PedidoCard
                facet={f}
                operarios={operarios}
                onOpen={onOpen}
                onAsignar={onAsignar}
                miId={miId}
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
