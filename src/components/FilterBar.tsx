"use client";

import type { EstadoOF, Familia } from "@/lib/types";
import { ESTADO, ESTADOS_ORDEN } from "@/lib/estado";
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
  situacion: SituacionFiltro;
  orden: Orden;
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-text-muted">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export function FilterBar({
  filtros,
  setFiltros,
  familias,
  clientes,
  showSituacion = false,
}: {
  filtros: Filtros;
  setFiltros: (f: Partial<Filtros>) => void;
  familias: Familia[];
  clientes: string[];
  showSituacion?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
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
          placeholder="Buscar AR o cliente…"
          className="glass-chip w-56 rounded-lg py-1.5 pl-8 pr-3 text-xs text-text outline-none placeholder:text-text-muted focus:border-brand-400"
        />
      </div>

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

      <Campo label="Orden">
        <Select
          value={filtros.orden}
          onChange={(v) => setFiltros({ orden: (v as Orden) ?? "planificacion" })}
          placeholder={null}
          options={[
            { value: "planificacion", label: "Planificación" },
            { value: "entrega", label: "Fecha de entrega" },
            { value: "prioridad", label: "Prioridad" },
            { value: "cliente", label: "Cliente" },
          ]}
        />
      </Campo>
    </div>
  );
}
