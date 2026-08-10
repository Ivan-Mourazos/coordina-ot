"use client";

import type { EstadoOF, Familia, Operario, Prioridad } from "@/lib/types";
import { ESTADO, ESTADOS_ORDEN, PRIORIDAD } from "@/lib/estado";
import { familiaMeta } from "@/lib/familia";
import {
  CATEGORIAS,
  CATEGORIA_AYUDA,
  CATEGORIA_LABEL,
  FILTROS_VACIOS,
  SIN_ASIGNAR,
  filtrosActivos,
  type Categoria,
  type Filtros,
} from "@/lib/filtros";
import { Select, OpDot } from "./Select";
import { FamiliaIcon } from "./FamiliaTag";

// ─── Barra de filtros ────────────────────────────────────────────────────────
// Un solo componente para las tres vistas, pero NO el mismo juego de filtros en
// las tres: lo que se enseña lo decide `vista`, en la tabla de aquí abajo.
//
// Antes eran cinco banderas sueltas (showEstado, showAtrasados, showAjenasOT…)
// repartidas por los sitios donde se monta la barra, y para saber qué salía en
// Revisión había que ir a leer Board. Peor: el estado de los filtros era ÚNICO
// para las tres vistas mientras cada una escondía controles distintos, así que
// elegías Estado="Aprobada" en la Lista, volvías a Asignar —que no enseña ese
// desplegable— y la bandeja seguía recortada por un filtro invisible. Ahora
// cada vista lleva sus propios filtros (ver `filtrosPorVista` en Board) y esta
// tabla garantiza que todo filtro activo tiene su control en pantalla.

export type VistaFiltrable = "asignar" | "lista" | "revision";

/** Qué controles se enseñan en cada vista, y por qué no los demás.
 *
 *  Todo lo que no está aquí se quitó por sobrar, no por olvido:
 *
 *  · **Cliente** (era un desplegable en las tres): el buscador ya busca por
 *    cliente y negocio. El desplegable obligaba a dar con el nombre exacto
 *    entre cientos —"MAHOU S.A." frente a "MAHOU"— para hacer lo mismo.
 *  · **Autor y revisor en la Lista**: para ver qué lleva cada uno están las
 *    zonas del tablero, que es donde el reparto se ve y se toca. En Revisión
 *    sí se quedan: ahí la pregunta "¿qué le falta por repasar a Tamara?" no
 *    tiene otro sitio donde hacerse.
 *  · **Solo atrasados en la Lista**: la columna Recorrido ya pinta la línea de
 *    tiempo de cada pedido y la tabla tiene "Atrasados primero". Tres formas
 *    de decir lo mismo eran dos de más. En Asignar se queda: ahí no hay línea
 *    de tiempo y es el panel donde se decide qué se coge antes.
 *  · **Esperando material en Asignar**: no impide plantear, así que no es un
 *    criterio para repartir. Es una consulta, y las consultas son la Lista. */
const CONTROLES: Record<VistaFiltrable, {
  estado: boolean;
  roles: boolean;
  fechas: boolean;
  pasados: boolean;
  categoria: boolean;
  atrasados: boolean;
  material: boolean;
}> = {
  // Asignar reparte trabajo sin empezar: el estado no discrimina (casi todo es
  // "pendiente") y filtrar por autor no tiene sentido en un panel que es, por
  // definición, lo que no tiene autor.
  asignar: { estado: false, roles: false, fechas: false, pasados: false, categoria: true, atrasados: true, material: false },
  lista: { estado: true, roles: false, fechas: true, pasados: true, categoria: true, atrasados: false, material: true },
  // Revisión ya está partida por estado de revisión y no enseña trabajo
  // terminado: el estado y las fechas sobran.
  revision: { estado: false, roles: true, fechas: false, pasados: false, categoria: false, atrasados: false, material: false },
};

/** Selector de MODO (situación): siempre tiene valor, así que el nombre va
 *  fuera — sin él, un desplegable que pone "Procesados" no dice de qué. Los
 *  FILTROS no usan esto: llevan su propio nombre dentro como texto vacío
 *  ("Familia") y lo sustituyen por el valor al elegir. */
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-text-muted">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

/** Interruptor de la barra (atrasados, material). Mismo aspecto que los
 *  desplegables cuando filtran, para que se lea de un vistazo qué está
 *  recortando la lista sin distinguir tipos de control. */
function Toggle({
  activo,
  onClick,
  title,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title={title}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        activo
          ? "bg-brand-500/15 text-brand-700 ring-1 ring-brand-400 dark:text-brand-300"
          : "glass-chip text-text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

export function FilterBar({
  vista,
  titulo,
  filtros,
  setFiltros,
  familias,
  operarios,
  conteos,
  agrupacion,
}: {
  vista: VistaFiltrable;
  /** Rótulo a la izquierda cuando la barra no filtra la vista entera, sino un
   *  panel suelto ("Sin asignar"). Sin él, la barra de Asignar parece filtrar
   *  también las zonas del equipo, y no las toca. */
  titulo?: string;
  filtros: Filtros;
  setFiltros: (f: Partial<Filtros>) => void;
  familias: Familia[];
  operarios: Operario[];
  /** Cuántas OF hay de cada categoría, para el desplegable "Ver". */
  conteos: Record<Categoria, number>;
  /** Control de AGRUPACIÓN de la vista, si lo tiene. Va aquí dentro y no
   *  suelto al lado para poder separarlo de verdad: filtrar quita cosas de la
   *  pantalla y agrupar solo reparte lo que queda, y puestos en fila sin más
   *  parecían lo mismo. Por eso van en dos zonas rotuladas. */
  agrupacion?: React.ReactNode;
}) {
  const ver = CONTROLES[vista];
  const activos = filtrosActivos(filtros);

  const opcionesPersona = [
    { value: SIN_ASIGNAR, label: "Sin asignar" },
    ...operarios.map((o) => ({
      value: o.id,
      label: o.nombre,
      icon: <OpDot color={o.color} iniciales={o.iniciales} />,
    })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {titulo && (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text">
          {titulo}
        </span>
      )}
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        Filtrar
      </span>

      {/* búsqueda, con su propia ✕: vaciarla es lo que más se hace y antes
          obligaba a ir a "Limpiar", que se lleva por delante el resto. */}
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
          className="glass-chip w-56 rounded-lg py-1.5 pl-8 pr-7 text-xs text-text outline-none placeholder:text-text-muted focus:border-brand-400"
        />
        {filtros.query && (
          <button
            type="button"
            onClick={() => setFiltros({ query: "" })}
            aria-label="Vaciar la búsqueda"
            className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
          >
            ✕
          </button>
        )}
      </div>

      <span className="h-5 w-px bg-[var(--glass-border)]" />

      {/* Filtros de contenido. El nombre del campo va DENTRO del desplegable y
          el valor lo sustituye al elegir: con la etiqueta fuera, "Familia
          Todas" gastaba el doble de sitio para decir que no filtra nada. Y al
          filtrar se pinta con el color de marca, así se ve de un vistazo cuál
          está recortando la lista. */}
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

      {ver.estado && (
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

      {/* Autor y revisor: "¿qué lleva Tamara?" no se podía preguntar en ningún
          sitio salvo mirando su zona del tablero, que además solo enseña lo que
          tiene asignado ahora. */}
      {ver.roles && (
        <>
          <Select
            value={filtros.autor === "todos" ? null : filtros.autor}
            onChange={(v) => setFiltros({ autor: v ?? "todos" })}
            placeholder="Autor"
            etiquetaVaciar="Cualquier autor"
            acentuarActivo
            options={opcionesPersona}
          />
          <Select
            value={filtros.revisor === "todos" ? null : filtros.revisor}
            onChange={(v) => setFiltros({ revisor: v ?? "todos" })}
            placeholder="Revisor"
            etiquetaVaciar="Cualquier revisor"
            acentuarActivo
            options={opcionesPersona}
          />
        </>
      )}

      {/* Ventana de planificación: "lo de esta semana" no se podía pedir. El
          Historial ya tenía sus dos fechas; esto es lo mismo para el trabajo
          que aún está por hacer. */}
      {ver.fechas && (
        <Campo label="Planificado">
          <input
            type="date"
            value={filtros.desde}
            onChange={(e) => setFiltros({ desde: e.target.value })}
            aria-label="Planificado desde"
            className={`glass-chip rounded-lg px-2 py-1 text-xs outline-none focus:border-brand-400 ${
              filtros.desde ? "text-brand-700 dark:text-brand-300" : "text-text-muted"
            }`}
          />
          <span className="text-text-muted">→</span>
          <input
            type="date"
            value={filtros.hasta}
            onChange={(e) => setFiltros({ hasta: e.target.value })}
            aria-label="Planificado hasta"
            className={`glass-chip rounded-lg px-2 py-1 text-xs outline-none focus:border-brand-400 ${
              filtros.hasta ? "text-brand-700 dark:text-brand-300" : "text-text-muted"
            }`}
          />
        </Campo>
      )}

      {ver.pasados && (
        <Toggle
          activo={filtros.incluirPasados}
          onClick={() => setFiltros({ incluirPasados: !filtros.incluirPasados })}
          title="Enseña también los pedidos ya pasados a Producción. Apagado, la lista es solo trabajo pendiente."
        >
          Con los pasados
        </Toggle>
      )}

      {/* "Ver": las categorías que NO son el trabajo normal de OT. Antes eran
          cuatro botones seguidos que gastaban una fila entera para decir "esto
          está escondido", y ninguno decía cuánto había detrás: había que
          pulsarlos a ciegas para descubrir que no había ninguna OF anulada. */}
      {ver.categoria && (
        <Campo label="Ver">
          <Select
            value={filtros.categoria}
            onChange={(v) => setFiltros({ categoria: (v as Categoria) ?? "normal" })}
            placeholder={null}
            acentuarActivo={filtros.categoria !== "normal"}
            options={CATEGORIAS.map((c) => ({
              value: c,
              label: conteos[c] > 0 ? `${CATEGORIA_LABEL[c]} · ${conteos[c]}` : CATEGORIA_LABEL[c],
            }))}
          />
        </Campo>
      )}

      {ver.material && (
        <Toggle
          activo={filtros.soloMaterialPendiente}
          onClick={() => setFiltros({ soloMaterialPendiente: !filtros.soloMaterialPendiente })}
          title="Enseña SOLO las OF que esperan material de compras. No se pueden terminar de plantear hasta que llegue."
        >
          Esperando material
        </Toggle>
      )}

      {ver.atrasados && (
        <Toggle
          activo={filtros.soloAtrasados}
          onClick={() => setFiltros({ soloAtrasados: !filtros.soloAtrasados })}
          title="Enseña SOLO los pedidos cuya fecha de planificación ya pasó y siguen sin terminar."
        >
          Solo atrasados
        </Toggle>
      )}

      {/* Zona de AGRUPAR, separada de la de filtrar con su propio rótulo y una
          división. El usuario leyó "Familia" (filtro) y "Familia" (agrupación)
          seguidos y no distinguía uno de otro; y no son lo mismo: filtrar por
          familia deja solo esa, agrupar por familia las enseña todas repartidas
          en filas. Se quedan las dos porque combinarlas es útil —agrupado por
          prioridad, filtrando solo toldos—, pero ya no se confunden. */}
      {agrupacion && (
        <>
          <span className="h-5 w-px bg-[var(--glass-border)]" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Agrupar
          </span>
          {agrupacion}
        </>
      )}

      {/* Limpiar, en la MISMA fila. Antes esto era una segunda línea de chips
          que aparecía al filtrar: la barra cambiaba de alto y empujaba la tabla
          entera hacia abajo cada vez. Los chips además repetían lo que ya dicen
          los desplegables acentuados. */}
      {activos.length > 0 && (
        <button
          type="button"
          onClick={() => setFiltros(FILTROS_VACIOS)}
          className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
          title={`Quitar ${activos.join(", ")}`}
        >
          <span aria-hidden>✕</span>
          Limpiar {activos.length > 1 ? `(${activos.length})` : ""}
        </button>
      )}
    </div>
  );
}

export { CATEGORIA_AYUDA };
