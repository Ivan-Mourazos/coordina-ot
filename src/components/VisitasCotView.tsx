"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  agruparVisitasPorFecha,
  type AmbitoVisitasCot,
  type VisitaCot,
  type VisitasCotPagina,
} from "@/lib/visitas-cot";

const REFRESCO_PENDIENTES_MS = 60_000;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function hoyISO(): string {
  const ahora = new Date();
  return [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, "0"),
    String(ahora.getDate()).padStart(2, "0"),
  ].join("-");
}

function fmtDia(fecha: string | null): {
  dia: string;
  semana: string;
  mes: string;
  completa: string;
} {
  if (!fecha) {
    return {
      dia: "—",
      semana: "Sin fecha",
      mes: "",
      completa: "Sin fecha planificada",
    };
  }
  const date = new Date(`${fecha}T12:00:00`);
  const semana = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
  }).format(date);
  const mes = new Intl.DateTimeFormat("es-ES", {
    month: "short",
  })
    .format(date)
    .replace(".", "");
  return {
    dia: String(date.getDate()).padStart(2, "0"),
    semana: `${semana[0].toUpperCase()}${semana.slice(1)}`,
    mes,
    completa: new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date),
  };
}

function fmtFechaHora(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function fmtActualizacion(iso: string | null): string {
  if (!iso) return "Sin actualizar";
  const date = new Date(iso);
  return `Actualizado a las ${new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date)}`;
}

function construirUrl({
  ambito,
  page,
  q,
  desde,
  hasta,
}: {
  ambito: AmbitoVisitasCot;
  page: number;
  q: string;
  desde: string;
  hasta: string;
}): string {
  const params = new URLSearchParams({
    ambito,
    page: String(page),
  });
  if (q) params.set("q", q);
  if (desde) params.set("desde", desde);
  if (hasta) params.set("hasta", hasta);
  return `/api/visitas-cot?${params}`;
}

/** Agenda de avisos COT. Es autónoma: solo consulta RPS mientras está montada. */
export function VisitasCotView() {
  const [ambito, setAmbito] = useState<AmbitoVisitasCot>("pendientes");
  const [query, setQuery] = useState("");
  const queryDebounced = useDebounced(query.trim(), 300);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [visitas, setVisitas] = useState<VisitaCot[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const cargar = useCallback(
    async (pagina: number, append: boolean) => {
      const seq = ++requestSeq.current;
      setCargando(true);
      setError(null);
      try {
        const url = construirUrl({
          ambito,
          page: pagina,
          q: queryDebounced,
          desde,
          hasta,
        });
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as VisitasCotPagina;
        if (seq !== requestSeq.current) return;
        setVisitas((prev) =>
          append ? [...prev, ...data.visitas] : data.visitas,
        );
        setPage(pagina);
        setHasMore(data.hasMore);
        setRefreshedAt(data.refreshedAt);
      } catch {
        if (seq === requestSeq.current) {
          setError(
            "No se pudieron cargar las visitas. Comprueba la conexión con RPS y vuelve a intentarlo.",
          );
        }
      } finally {
        if (seq === requestSeq.current) setCargando(false);
      }
    },
    [ambito, queryDebounced, desde, hasta],
  );

  useEffect(() => {
    const id = setTimeout(() => void cargar(0, false), 0);
    return () => clearTimeout(id);
  }, [cargar]);

  useEffect(() => {
    if (ambito !== "pendientes") return;
    const id = setInterval(() => void cargar(0, false), REFRESCO_PENDIENTES_MS);
    return () => clearInterval(id);
  }, [ambito, cargar]);

  const grupos = useMemo(
    () => agruparVisitasPorFecha(visitas),
    [visitas],
  );
  const hayFiltros = Boolean(query || desde || hasta);

  return (
    <section className="mx-auto w-full max-w-[1500px] space-y-4">
      <header className="glass-panel overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center gap-5 border-b border-border px-5 py-4">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-700 dark:text-brand-300">
              Agenda COT · solo lectura
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-text">
              Visitas con Oficina Técnica
            </h1>
            <p className="mt-0.5 text-xs text-text-muted">
              Una línea por visita registrada en RPS, aunque compartan incidencia.
            </p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-[11px] text-text-muted sm:inline">
              {fmtActualizacion(refreshedAt)}
            </span>
            <button
              type="button"
              onClick={() => void cargar(0, false)}
              disabled={cargando}
              className="chip-3d inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-text disabled:cursor-wait disabled:opacity-55"
            >
              <RefreshIcon className={cargando ? "animate-spin" : ""} />
              Actualizar
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 px-5 py-3.5">
          <div
            className="glass-chip inline-flex rounded-xl p-1"
            aria-label="Ámbito de las visitas"
          >
            {(["pendientes", "historial"] as const).map((opcion) => {
              const activa = ambito === opcion;
              return (
                <button
                  type="button"
                  key={opcion}
                  aria-pressed={activa}
                  onClick={() => setAmbito(opcion)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    activa
                      ? "bg-brand-400 text-[#231903] shadow-sm"
                      : "text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
                  }`}
                >
                  {opcion === "pendientes" ? "Pendientes" : "Historial"}
                </button>
              );
            })}
          </div>

          <label className="relative min-w-64 flex-1">
            <span className="sr-only">Buscar visitas</span>
            <SearchIcon />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Incidencia, pedido, texto o responsable…"
              className="h-9 w-full rounded-xl border border-border bg-surface/80 pl-9 pr-3 text-sm text-text shadow-sm outline-none placeholder:text-text-muted/75 focus:border-brand-400"
            />
          </label>

          <label className="flex items-center gap-2 text-[11px] text-text-muted">
            Desde
            <input
              type="date"
              value={desde}
              onChange={(event) => setDesde(event.target.value)}
              className="h-9 rounded-xl border border-border bg-surface/80 px-2.5 text-xs text-text shadow-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-[11px] text-text-muted">
            Hasta
            <input
              type="date"
              value={hasta}
              onChange={(event) => setHasta(event.target.value)}
              className="h-9 rounded-xl border border-border bg-surface/80 px-2.5 text-xs text-text shadow-sm"
            />
          </label>

          {hayFiltros ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setDesde("");
                setHasta("");
              }}
              className="h-9 rounded-lg px-2.5 text-xs font-semibold text-text-muted hover:bg-surface-2 hover:text-text"
            >
              Limpiar
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-red-500/35 bg-red-500/8 px-4 py-3 text-sm text-text"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-red-500/12 font-bold text-red-600 dark:text-red-300">
            !
          </span>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void cargar(0, false)}
            className="ml-auto rounded-lg bg-surface px-3 py-1.5 text-xs font-semibold ring-1 ring-border hover:bg-surface-2"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {visitas.length === 0 && cargando ? (
        <AgendaSkeleton />
      ) : null}

      {visitas.length === 0 && !cargando && !error ? (
        <div className="glass-panel grid min-h-56 place-items-center rounded-2xl px-6 text-center">
          <div>
            <CalendarIcon />
            <p className="mt-3 text-sm font-semibold text-text">
              {hayFiltros
                ? "No hay visitas con estos filtros"
                : ambito === "pendientes"
                  ? "No hay visitas pendientes"
                  : "El historial está vacío"}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {hayFiltros
                ? "Prueba otro texto o amplía el periodo."
                : "La lista se actualizará cuando RPS tenga nuevos avisos COT."}
            </p>
          </div>
        </div>
      ) : null}

      {grupos.length > 0 ? (
        <div className="space-y-3">
          {grupos.map((grupo) => (
            <GrupoDia
              key={grupo.fecha ?? "sin-fecha"}
              fecha={grupo.fecha}
              visitas={grupo.visitas}
              ambito={ambito}
            />
          ))}
        </div>
      ) : null}

      {hasMore ? (
        <div className="flex justify-center py-2">
          <button
            type="button"
            disabled={cargando}
            onClick={() => void cargar(page + 1, true)}
            className="chip-3d rounded-xl px-5 py-2.5 text-xs font-semibold text-text disabled:cursor-wait disabled:opacity-55"
          >
            {cargando ? "Cargando…" : "Cargar visitas anteriores"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function GrupoDia({
  fecha,
  visitas,
  ambito,
}: {
  fecha: string | null;
  visitas: VisitaCot[];
  ambito: AmbitoVisitasCot;
}) {
  const label = fmtDia(fecha);
  const atrasado =
    ambito === "pendientes" && Boolean(fecha && fecha < hoyISO());
  const acento = atrasado
    ? "bg-red-500"
    : ambito === "pendientes"
      ? "bg-brand-400"
      : "bg-cyan-600";

  return (
    <section
      aria-label={label.completa}
      className="glass-panel grid overflow-hidden rounded-2xl lg:grid-cols-[9.5rem_minmax(0,1fr)]"
    >
      <div className="relative flex items-center gap-3 border-b border-border bg-surface/35 px-4 py-3 lg:block lg:border-b-0 lg:border-r lg:px-5 lg:py-5">
        <span
          className={`absolute left-0 top-0 h-full w-1 ${acento}`}
          aria-hidden="true"
        />
        <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-text">
          {label.dia}
        </span>
        <div className="lg:mt-1">
          <p className="text-xs font-semibold text-text">{label.semana}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
            {label.mes}
          </p>
        </div>
        <p className="ml-auto text-[10px] font-semibold text-text-muted lg:ml-0 lg:mt-5">
          {visitas.length} {visitas.length === 1 ? "visita" : "visitas"}
        </p>
        {atrasado ? (
          <span className="ml-2 rounded-full bg-red-500/12 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300 lg:ml-0 lg:mt-2 lg:inline-block">
            Atrasada
          </span>
        ) : null}
      </div>

      <div className="divide-y divide-border">
        {visitas.map((visita) => (
          <VisitaRow key={visita.idOrden} visita={visita} />
        ))}
      </div>
    </section>
  );
}

function VisitaRow({ visita }: { visita: VisitaCot }) {
  const [abierta, setAbierta] = useState(false);
  const tieneDetalle = Boolean(
    visita.texto || visita.solucion || visita.notas || visita.fechaAviso,
  );

  return (
    <article className="bg-surface/45">
      <button
        type="button"
        aria-expanded={abierta}
        disabled={!tieneDetalle}
        onClick={() => setAbierta((actual) => !actual)}
        className="grid w-full grid-cols-[7rem_9rem_minmax(12rem,1fr)_13rem_1.5rem] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface/75 disabled:cursor-default"
      >
        <span className="font-mono text-xs font-bold text-text">
          {visita.incidencia || "Sin código"}
        </span>
        <span
          className={`truncate font-mono text-[11px] ${
            visita.pedido ? "text-text" : "italic text-text-muted"
          }`}
          title={visita.pedido ?? "Sin pedido enlazado"}
        >
          {visita.pedido ?? "Sin pedido"}
        </span>
        <span className="truncate text-sm text-text">
          {visita.texto || visita.solucion || "Sin descripción"}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`size-2 shrink-0 rounded-full ${
              visita.estado === "pendiente" ? "bg-brand-500" : "bg-emerald-600"
            }`}
          />
          <span className="truncate text-xs font-medium text-text-muted">
            {visita.responsable}
          </span>
        </span>
        <ChevronIcon abierta={abierta} />
      </button>

      {abierta ? (
        <div className="grid gap-4 border-t border-border bg-surface-2/55 px-4 py-4 md:grid-cols-[minmax(0,1.4fr)_minmax(12rem,0.8fr)_minmax(12rem,0.8fr)]">
          <Detalle label="Aviso" value={visita.texto || "Sin texto"} />
          <Detalle
            label="Resultado"
            value={
              visita.solucion ??
              (visita.estado === "pendiente" ? "Pendiente de realizar" : "—")
            }
          />
          <Detalle label="Notas" value={visita.notas ?? "Sin notas"} />
          <div className="md:col-span-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 font-mono text-[10px] text-text-muted">
            <span>Alta: {fmtFechaHora(visita.fechaAviso)}</span>
            <span>Estado RPS: {visita.estadoRps}</span>
            <span>Orden: {visita.idOrden}</span>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Detalle({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.17em] text-text-muted">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-text">
        {value}
      </p>
    </div>
  );
}

function AgendaSkeleton() {
  return (
    <div className="space-y-3" aria-label="Cargando agenda">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="glass-panel grid animate-pulse overflow-hidden rounded-2xl lg:grid-cols-[9.5rem_minmax(0,1fr)]"
        >
          <div className="h-24 border-r border-border bg-surface/35" />
          <div className="space-y-3 px-4 py-5">
            <div className="h-3 w-4/5 rounded bg-border" />
            <div className="h-3 w-3/5 rounded bg-border" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RefreshIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`size-3.5 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M20 7v5h-5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M18.5 15a7 7 0 1 1-.7-7.8L20 9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mx-auto size-8 text-brand-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" strokeLinecap="round" />
      <path d="M8 14h2M14 14h2M8 17h2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ abierta }: { abierta: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`size-4 text-text-muted transition-transform ${
        abierta ? "rotate-180" : ""
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
