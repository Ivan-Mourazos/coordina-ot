"use client";

import type { EstadoOF, Familia, Prioridad } from "@/lib/types";
import { ESTADO, ESTADOS_ORDEN, PRIORIDAD } from "@/lib/estado";
import { familiaMeta } from "@/lib/familia";
import { Select } from "./Select";
import { FamiliaIcon } from "./FamiliaTag";

export type Orden = "planificacion" | "familia" | "prioridad" | "entrega" | "cliente";
export type SituacionFiltro = "procesado" | "pendiente" | "todos";

export interface Filtros {
  query: string;
  familia: Familia | "todas";
  cliente: string | "todos";
  estado: EstadoOF | "todos";
  prioridad: Prioridad | "todas";
  soloAtrasados: boolean;
  /** Mostrar también las OF que entran por una tarea de taller y que nadie ha
   *  rescatado. Fuera de la Lista no se ofrece: el tablero nunca las enseña. */
  verAjenasOT: boolean;
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
  verAjenasOT: false,
};

/** Selector de MODO (situación, orden): siempre tiene valor, así que el nombre
 *  va fuera — sin él, un desplegable que pone "Planificación" no dice de qué.
 *  Los FILTROS no usan esto: llevan su propio nombre dentro como texto vacío
 *  ("Familia") y lo sustituyen por el valor al elegir. */
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
  if (f.verAjenasOT) chips.push({ clave: "verAjenasOT", texto: "Con las de taller" });
  return chips;
}

const VACIO_POR_CLAVE: Partial<Filtros> = {
  query: "",
  familia: "todas",
  cliente: "todos",
  estado: "todos",
  prioridad: "todas",
  soloAtrasados: false,
  verAjenasOT: false,
};

export function FilterBar({
  filtros,
  setFiltros,
  familias,
  clientes,
  showSituacion = false,
  showEstado = true,
  showAtrasados = true,
  showAjenasOT = false,
  ordenes = ["planificacion", "prioridad", "entrega", "cliente"],
}: {
  filtros: Filtros;
  setFiltros: (f: Partial<Filtros>) => void;
  familias: Familia[];
  clientes: string[];
  showSituacion?: boolean;
  /** El filtro de estado de OF no aplica en Asignar (casi todo pendiente). */
  showEstado?: boolean;
  /** El toggle "Solo atrasados" no aplica en Historial (ya están hechos). */
  showAtrasados?: boolean;
  /** Solo en la Lista: dejar ver las OF que entran por una tarea de taller.
   *  En el tablero no se ofrece porque ahí no se enseñan nunca. */
  showAjenasOT?: boolean;
  /** Opciones de orden disponibles en esta vista. */
  ordenes?: Orden[];
}) {
  const activos = filtrosActivos(filtros);
  const ORDEN_LABEL: Record<Orden, string> = {
    planificacion: "Planificación",
    familia: "Familia",
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

        {/* Filtros de contenido. El nombre del campo va DENTRO del desplegable
            y el valor lo sustituye al elegir: con la etiqueta fuera, "Familia
            Todas" gastaba el doble de sitio para decir que no filtra nada. Y
            al filtrar se pinta con el color de marca, así se ve de un vistazo
            cuál está recortando la lista. */}
        <Select
          value={filtros.familia === "todas" ? null : filtros.familia}
          onChange={(v) => setFiltros({ familia: (v as Familia) ?? "todas" })}
          placeholder="Familia"
          etiquetaVaciar="Todas las familias"
          acentuarActivo
          options={familias.map((f) => ({
            value: f,
            label: familiaMeta(f).label,
            icon: <FamiliaIcon familia={f} className="size-3.5" />,
          }))}
        />

        <Select
          value={filtros.cliente === "todos" ? null : filtros.cliente}
          onChange={(v) => setFiltros({ cliente: v ?? "todos" })}
          placeholder="Cliente"
          etiquetaVaciar="Todos los clientes"
          acentuarActivo
          className="max-w-52"
          options={clientes.map((c) => ({ value: c, label: c }))}
        />

        {showEstado && (
          <Select
            value={filtros.estado === "todos" ? null : filtros.estado}
            onChange={(v) => setFiltros({ estado: (v as EstadoOF) ?? "todos" })}
            placeholder="Estado"
            etiquetaVaciar="Todos los estados"
            acentuarActivo
            options={ESTADOS_ORDEN.map((e) => ({
              value: e,
              label: ESTADO[e].label,
              icon: <span className={`size-2 shrink-0 rounded-full ${ESTADO[e].dot}`} />,
            }))}
          />
        )}

        <Select
          value={filtros.prioridad === "todas" ? null : String(filtros.prioridad)}
          onChange={(v) => setFiltros({ prioridad: v ? (Number(v) as Prioridad) : "todas" })}
          placeholder="Prioridad"
          etiquetaVaciar="Todas las prioridades"
          acentuarActivo
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

        {showAjenasOT && (
          <button
            type="button"
            onClick={() => setFiltros({ verAjenasOT: !filtros.verAjenasOT })}
            aria-pressed={filtros.verAjenasOT}
            title="Las OF que entran por una tarea de taller (capotas, faldones): no son trabajo de OT, pero se pueden buscar aquí"
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              filtros.verAjenasOT
                ? "bg-brand-500/15 text-brand-700 ring-1 ring-brand-400 dark:text-brand-300"
                : "glass-chip text-text-muted hover:text-text"
            }`}
          >
            Con las de taller
          </button>
        )}

        {showAtrasados && (
          <button
            type="button"
            onClick={() => setFiltros({ soloAtrasados: !filtros.soloAtrasados })}
            aria-pressed={filtros.soloAtrasados}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              filtros.soloAtrasados
                ? "bg-brand-500/15 text-brand-700 ring-1 ring-brand-400 dark:text-brand-300"
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

        {/* Limpiar, en la MISMA fila. Antes esto era una segunda línea de
            chips que aparecía al filtrar: la barra cambiaba de alto y empujaba
            la tabla entera hacia abajo cada vez. Los chips además repetían lo
            que ya dicen los desplegables acentuados. */}
        {activos.length > 0 && (
          <button
            type="button"
            onClick={() => setFiltros(VACIO_POR_CLAVE)}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
            title={`Quitar ${activos.map((c) => c.texto).join(", ")}`}
          >
            <span aria-hidden>✕</span>
            Limpiar {activos.length > 1 ? `(${activos.length})` : ""}
          </button>
        )}
      </div>
    </div>
  );
}
