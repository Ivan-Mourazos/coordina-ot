"use client";

import type { EstadoOF, Familia, Prioridad } from "@/lib/types";
import { ESTADO, ESTADOS_ORDEN, PRIORIDAD } from "@/lib/estado";
import { familiaMeta } from "@/lib/familia";
import { Select } from "./Select";
import { FamiliaIcon } from "./FamiliaTag";

export type Orden = "planificacion" | "entrega" | "prioridad" | "cliente";
export type SituacionFiltro = "procesado" | "pendiente" | "todos";

export interface Filtros {
  query: string;
  familia: Familia | "todas";
  cliente: string | "todos";
  estado: EstadoOF | "todos";
  prioridad: Prioridad | "todas";
  soloAtrasados: boolean;
  situacion: SituacionFiltro;
  orden: Orden;
}

/** Valores "neutros" de cada filtro (para saber cuáles están activos). */
export const FILTROS_VACIOS: Omit<Filtros, "situacion" | "orden"> = {
  query: "",
  familia: "todas",
  cliente: "todos",
  estado: "todos",
  prioridad: "todas",
  soloAtrasados: false,
};

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-text-muted">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

/** Etiquetas legibles de los filtros activos, para los chips de resumen. */
function filtrosActivos(f: Filtros): { clave: keyof Filtros; texto: string }[] {
  const chips: { clave: keyof Filtros; texto: string }[] = [];
  if (f.query.trim()) chips.push({ clave: "query", texto: `"${f.query.trim()}"` });
  if (f.familia !== "todas")
    chips.push({ clave: "familia", texto: familiaMeta(f.familia).label });
  if (f.cliente !== "todos") chips.push({ clave: "cliente", texto: f.cliente });
  if (f.estado !== "todos")
    chips.push({ clave: "estado", texto: ESTADO[f.estado].label });
  if (f.prioridad !== "todas")
    chips.push({ clave: "prioridad", texto: PRIORIDAD[f.prioridad].label });
  if (f.soloAtrasados) chips.push({ clave: "soloAtrasados", texto: "Solo atrasados" });
  return chips;
}

const VACIO_POR_CLAVE: Partial<Filtros> = {
  query: "",
  familia: "todas",
  cliente: "todos",
  estado: "todos",
  prioridad: "todas",
  soloAtrasados: false,
};

export function FilterBar({
  filtros,
  setFiltros,
  familias,
  clientes,
  showSituacion = false,
  showAtrasados = true,
  ordenes = ["planificacion", "prioridad", "entrega", "cliente"],
}: {
  filtros: Filtros;
  setFiltros: (f: Partial<Filtros>) => void;
  familias: Familia[];
  clientes: string[];
  showSituacion?: boolean;
  /** El toggle "Solo atrasados" no aplica en Historial (ya están hechos). */
  showAtrasados?: boolean;
  /** Opciones de orden disponibles en esta vista. */
  ordenes?: Orden[];
}) {
  const activos = filtrosActivos(filtros);
  const ORDEN_LABEL: Record<Orden, string> = {
    planificacion: "Planificación",
    prioridad: "Prioridad",
    entrega: "Fecha de entrega",
    cliente: "Cliente",
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* búsqueda */}
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            value={filtros.query}
            onChange={(e) => setFiltros({ query: e.target.value })}
            placeholder="Buscar AR, cliente o negocio…"
            className="glass-chip w-56 rounded-lg py-1.5 pl-8 pr-3 text-xs text-text outline-none placeholder:text-text-muted focus:border-brand-400"
          />
        </div>

        <span className="h-5 w-px bg-[var(--glass-border)]" />

        {/* filtros de contenido */}
        <Campo label="Familia">
          <Select
            value={filtros.familia === "todas" ? null : filtros.familia}
            onChange={(v) => setFiltros({ familia: (v as Familia) ?? "todas" })}
            placeholder="Todas"
            options={familias.map((f) => ({
              value: f,
              label: familiaMeta(f).label,
              icon: <FamiliaIcon familia={f} className="size-3.5" />,
            }))}
          />
        </Campo>

        <Campo label="Cliente">
          <Select
            value={filtros.cliente === "todos" ? null : filtros.cliente}
            onChange={(v) => setFiltros({ cliente: v ?? "todos" })}
            placeholder="Todos"
            options={clientes.map((c) => ({ value: c, label: c }))}
          />
        </Campo>

        <Campo label="Estado">
          <Select
            value={filtros.estado === "todos" ? null : filtros.estado}
            onChange={(v) => setFiltros({ estado: (v as EstadoOF) ?? "todos" })}
            placeholder="Todos"
            options={ESTADOS_ORDEN.map((e) => ({
              value: e,
              label: ESTADO[e].label,
              icon: <span className={`size-2 shrink-0 rounded-full ${ESTADO[e].dot}`} />,
            }))}
          />
        </Campo>

        <Campo label="Prioridad">
          <Select
            value={filtros.prioridad === "todas" ? null : String(filtros.prioridad)}
            onChange={(v) =>
              setFiltros({ prioridad: v ? (Number(v) as Prioridad) : "todas" })
            }
            placeholder="Todas"
            options={([3, 2, 1] as Prioridad[]).map((p) => ({
              value: String(p),
              label: PRIORIDAD[p].label,
              icon: (
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: PRIORIDAD[p].color }}
                />
              ),
            }))}
          />
        </Campo>

        {showSituacion && (
          <Campo label="Situación">
            <Select
              value={filtros.situacion === "todos" ? null : filtros.situacion}
              onChange={(v) => setFiltros({ situacion: (v as SituacionFiltro) ?? "todos" })}
              placeholder="Todos"
              options={[
                { value: "procesado", label: "Procesados" },
                { value: "pendiente", label: "Pendientes de procesar" },
              ]}
            />
          </Campo>
        )}

        {showAtrasados && (
          <button
            type="button"
            onClick={() => setFiltros({ soloAtrasados: !filtros.soloAtrasados })}
            aria-pressed={filtros.soloAtrasados}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              filtros.soloAtrasados
                ? "bg-red-600 text-white"
                : "glass-chip text-text-muted hover:text-text"
            }`}
          >
            Solo atrasados
          </button>
        )}

        <span className="h-5 w-px bg-[var(--glass-border)]" />

        {/* orden */}
        <Campo label="Orden">
          <Select
            value={filtros.orden}
            onChange={(v) => setFiltros({ orden: (v as Orden) ?? "planificacion" })}
            placeholder={null}
            options={ordenes.map((o) => ({ value: o, label: ORDEN_LABEL[o] }))}
          />
        </Campo>
      </div>

      {/* resumen de filtros activos + limpiar */}
      {activos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activos.map((c) => (
            <button
              key={c.clave}
              type="button"
              onClick={() => setFiltros({ [c.clave]: VACIO_POR_CLAVE[c.clave] })}
              className="flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold text-brand-700 hover:bg-brand-500/25 dark:text-brand-300"
              title="Quitar este filtro"
            >
              {c.texto}
              <span aria-hidden>✕</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFiltros(VACIO_POR_CLAVE)}
            className="text-[10px] font-semibold text-text-muted underline-offset-2 hover:text-text hover:underline"
          >
            Limpiar todo
          </button>
        </div>
      )}
    </div>
  );
}
