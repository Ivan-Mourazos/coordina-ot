"use client";

import type { EstadoOF, Familia } from "@/lib/types";
import { ESTADO, ESTADOS_ORDEN } from "@/lib/estado";

export type Orden = "planificacion" | "entrega" | "prioridad" | "cliente";
export type SituacionFiltro = "procesado" | "pendiente" | "todos";

export interface Filtros {
  query: string;
  familia: Familia | "todas";
  cliente: string | "todos";
  estado: EstadoOF | "todos";
  situacion: SituacionFiltro;
  orden: Orden;
  size: number;
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-text-muted">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-text outline-none focus:border-brand-400"
      >
        {children}
      </select>
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
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
      <div className="relative">
        <input
          value={filtros.query}
          onChange={(e) => setFiltros({ query: e.target.value })}
          placeholder="Buscar AR o cliente…"
          className="w-52 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text outline-none placeholder:text-text-muted focus:border-brand-400"
        />
      </div>

      <Select
        label="Familia:"
        value={filtros.familia}
        onChange={(v) => setFiltros({ familia: v as Filtros["familia"] })}
      >
        <option value="todas">Todas</option>
        {familias.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </Select>

      <Select
        label="Cliente:"
        value={filtros.cliente}
        onChange={(v) => setFiltros({ cliente: v })}
      >
        <option value="todos">Todos</option>
        {clientes.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>

      <Select
        label="Estado:"
        value={filtros.estado}
        onChange={(v) => setFiltros({ estado: v as Filtros["estado"] })}
      >
        <option value="todos">Todos</option>
        {ESTADOS_ORDEN.map((e) => (
          <option key={e} value={e}>
            {ESTADO[e].label}
          </option>
        ))}
      </Select>

      {showSituacion && (
        <Select
          label="Situación:"
          value={filtros.situacion}
          onChange={(v) => setFiltros({ situacion: v as SituacionFiltro })}
        >
          <option value="procesado">Procesados</option>
          <option value="pendiente">Pendientes de procesar</option>
          <option value="todos">Todos</option>
        </Select>
      )}

      <Select
        label="Orden:"
        value={filtros.orden}
        onChange={(v) => setFiltros({ orden: v as Orden })}
      >
        <option value="planificacion">Planificación</option>
        <option value="entrega">Data de entrega</option>
        <option value="prioridad">Prioridad</option>
        <option value="cliente">Cliente</option>
      </Select>

      <label className="flex items-center gap-2 text-xs text-text-muted">
        <span className="font-medium">Tamaño:</span>
        <input
          type="range"
          min={0.7}
          max={1.6}
          step={0.05}
          value={filtros.size}
          onChange={(e) => setFiltros({ size: Number(e.target.value) })}
          className="w-28 accent-brand-500"
        />
      </label>
    </div>
  );
}
