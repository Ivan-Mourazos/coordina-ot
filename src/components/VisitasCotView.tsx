"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  agruparVisitasPorFecha,
  type VisitaCot,
  type VisitasCotPagina,
} from "@/lib/visitas-cot";
import { inicialesDe } from "@/lib/nombre-persona";
import { tituloDia } from "@/lib/fechas";
import { hoyISO } from "@/lib/types";
import {
  CalendarioVisitas,
  primerDiaDelMes,
  ultimoDiaDelMes,
  type DiaConVisitas,
} from "./CalendarioVisitas";

// ─── Agenda de visitas COT ───────────────────────────────────────────────────
// Un comercial pide que Oficina Técnica le acompañe a ver una obra. Lo único
// que se viene a mirar aquí es QUÉ DÍA, QUIÉN y PARA QUÉ, y antes eso estaba
// dentro de una tabla de cinco columnas con el código de incidencia primero, el
// texto crudo de RPS en medio —encabezado, motivo y línea de OF, todo seguido y
// truncado— y el comercial en MAYÚSCULAS Y DEL REVÉS al final.
//
// Ahora son dos piezas: un calendario del mes que dice qué días hay algo, y a
// su derecha esas visitas en fichas legibles. El calendario es la pregunta que
// se hace de verdad ("¿qué tengo esta semana?"); la lista, la respuesta.

const REFRESCO_MS = 60_000;
/** Tope de páginas encadenadas al cargar un mes. Un mes malo son ~55 visitas y
 *  la página trae 40: con dos vueltas sobra, y el tope evita que un filtro raro
 *  se ponga a pedir páginas sin fin. */
const MAX_PAGINAS = 5;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
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
  return `Actualizado a las ${new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))}`;
}

/** Color estable por comercial, para reconocerlo sin leer el nombre. Sale del
 *  propio nombre, así que no hay lista que mantener y el mismo comercial tiene
 *  siempre el mismo color. */
function colorDe(nombre: string): string {
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 42%)`;
}

// ─── Qué parte del mes se enseña ─────────────────────────────────────────────
// La pregunta que se hace al abrir esto es "¿qué viene?", así que lo que manda
// es LO PRÓXIMO: de hoy en adelante, con lo primero arriba. "Todo el mes" queda
// como la otra mitad —lo que ya pasó— para cuando hay que repasar.
//
// Se descartó un "Hoy" como segunda opción, que es lo primero que se piensa:
// hay 19 visitas en el mes de agosto repartidas en ~20 días de trabajo, y
// además vienen a rachas (tres el mismo día y luego cuatro sin ninguna). Un
// botón que la mayoría de los días deja el panel vacío no es un filtro útil, es
// una forma de esconder la agenda. El día suelto se sigue pudiendo ver, y con
// un gesto más natural: pulsándolo en el calendario.
type Ambito = "proximas" | "mes";

export function VisitasCotView() {
  const [mes, setMes] = useState(() => primerDiaDelMes(hoyISO()));
  const [dia, setDia] = useState<string | null>(null);
  const [ambito, setAmbito] = useState<Ambito>("proximas");
  const [query, setQuery] = useState("");
  const queryDebounced = useDebounced(query.trim(), 300);
  const [visitas, setVisitas] = useState<VisitaCot[]>([]);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  // Se pide el MES ENTERO, con las cerradas y las pendientes: el calendario
  // tiene que poder decir de cada día si queda algo o ya está todo hecho, y con
  // media agenda fuera diría que no hay nada donde sí lo hubo.
  const cargar = useCallback(async () => {
    const seq = ++requestSeq.current;
    setCargando(true);
    setError(null);
    try {
      const acumulado: VisitaCot[] = [];
      let pagina = 0;
      let refrescado: string | null = null;
      for (;;) {
        const params = new URLSearchParams({
          ambito: "todas",
          page: String(pagina),
          desde: primerDiaDelMes(mes),
          hasta: ultimoDiaDelMes(mes),
        });
        if (queryDebounced) params.set("q", queryDebounced);
        const res = await fetch(`/api/visitas-cot?${params}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as VisitasCotPagina;
        if (seq !== requestSeq.current) return; // llegó tarde: manda la última
        acumulado.push(...data.visitas);
        refrescado = data.refreshedAt;
        pagina += 1;
        if (!data.hasMore || pagina >= MAX_PAGINAS) break;
      }
      setVisitas(acumulado);
      setRefreshedAt(refrescado);
    } catch {
      if (seq === requestSeq.current) {
        setError(
          "No se pudieron cargar las visitas. Comprueba la conexión con RPS y vuelve a intentarlo.",
        );
      }
    } finally {
      if (seq === requestSeq.current) setCargando(false);
    }
  }, [mes, queryDebounced]);

  useEffect(() => {
    const id = setTimeout(() => void cargar(), 0);
    return () => clearTimeout(id);
  }, [cargar]);

  useEffect(() => {
    const id = setInterval(() => void cargar(), REFRESCO_MS);
    return () => clearInterval(id);
  }, [cargar]);

  // Cambiar de mes deja de tener sentido el día elegido del anterior.
  const mesDelDia = dia ? primerDiaDelMes(dia) : null;
  if (mesDelDia !== null && mesDelDia !== mes) setDia(null);

  const hoy = hoyISO();

  const diasConVisitas: DiaConVisitas[] = useMemo(() => {
    const m = new Map<string, DiaConVisitas>();
    for (const v of visitas) {
      if (!v.fechaVisita) continue;
      const d = m.get(v.fechaVisita) ?? { fecha: v.fechaVisita, total: 0, pendientes: 0 };
      d.total += 1;
      if (v.estado === "pendiente") d.pendientes += 1;
      m.set(v.fechaVisita, d);
    }
    return [...m.values()];
  }, [visitas]);

  // "Próximas" solo significa algo en el mes en curso: en agosto mirando
  // octubre, TODO es próximo, y en julio no lo es nada. Fuera del mes de hoy el
  // recorte no se aplica y el selector se calla, en vez de ofrecer un botón que
  // unas veces filtra y otras no.
  const esMesDeHoy = mes === primerDiaDelMes(hoyISO());
  const recortaProximas = esMesDeHoy && ambito === "proximas";

  const mostradas = useMemo(() => {
    if (dia) return visitas.filter((v) => v.fechaVisita === dia);
    if (recortaProximas) return visitas.filter((v) => (v.fechaVisita ?? "") >= hoy);
    return visitas;
  }, [visitas, dia, recortaProximas, hoy]);
  const grupos = useMemo(() => agruparVisitasPorFecha(mostradas), [mostradas]);
  const pendientesMes = visitas.filter((v) => v.estado === "pendiente").length;
  const nProximas = visitas.filter((v) => (v.fechaVisita ?? "") >= hoy).length;

  return (
    <section className="mx-auto w-full max-w-[1500px] space-y-4">
      <header className="glass-panel flex flex-wrap items-center gap-4 rounded-2xl px-5 py-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-700 dark:text-brand-300">
            Agenda COT · solo lectura
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-text">
            Visitas con Oficina Técnica
          </h1>
          <p className="mt-0.5 text-xs text-text-muted">
            Las que piden los comerciales para que OT les acompañe a ver la obra. Se
            registran en RPS; aquí solo se consultan.
          </p>
        </div>

        <label className="relative ml-auto min-w-64 flex-1 sm:max-w-sm">
          <span className="sr-only">Buscar visitas</span>
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Comercial, cliente, pedido o incidencia…"
            className="h-9 w-full rounded-xl border border-border bg-surface/80 pl-9 pr-3 text-sm text-text shadow-sm outline-none placeholder:text-text-muted/75 focus:border-brand-400"
          />
        </label>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-[11px] text-text-muted sm:inline">
            {fmtActualizacion(refreshedAt)}
          </span>
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={cargando}
            className="chip-3d inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-text disabled:cursor-wait disabled:opacity-55"
          >
            <RefreshIcon className={cargando ? "animate-spin" : ""} />
            Actualizar
          </button>
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
            onClick={() => void cargar()}
            className="ml-auto rounded-lg bg-surface px-3 py-1.5 text-xs font-semibold ring-1 ring-border hover:bg-surface-2"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {/* El calendario NO se mueve al hacer scroll de la lista: se mira mientras
          se lee, para saber de qué día es lo que hay a la derecha. */}
      <div className="grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-20">
          <CalendarioVisitas
            mes={mes}
            dias={diasConVisitas}
            seleccionado={dia}
            onSeleccionar={setDia}
            onCambiarMes={setMes}
          />
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-text">
              {dia
                ? tituloDia(dia, hoy).titulo
                : recortaProximas
                  ? "Lo próximo"
                  : "Todo el mes"}
              {dia && tituloDia(dia, hoy).sub && (
                <span className="ml-1.5 font-normal text-text-muted">
                  {tituloDia(dia, hoy).sub}
                </span>
              )}
            </h2>
            <span className="text-[11px] text-text-muted">
              {mostradas.length} visita{mostradas.length === 1 ? "" : "s"}
              {!dia && pendientesMes > 0 && ` · ${pendientesMes} por hacer en el mes`}
            </span>

            {/* Solo en el mes en curso, y solo sin día elegido: con un día
                puesto, el que manda es el día y estos dos botones dirían que
                se está viendo otra cosa. */}
            {!dia && esMesDeHoy && (
              <span className="glass-chip ml-auto inline-flex rounded-lg p-1" role="group" aria-label="Qué parte del mes">
                {(
                  [
                    ["proximas", "Lo próximo", nProximas],
                    ["mes", "Todo el mes", visitas.length],
                  ] as const
                ).map(([id, texto, n]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAmbito(id)}
                    aria-pressed={ambito === id}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      ambito === id
                        ? "bg-brand-400 text-[#231903] shadow-sm"
                        : "text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
                    }`}
                  >
                    {texto}
                    {/* El número delante de pulsar: sin él, "Todo el mes" es un
                        salto a ciegas y no se sabe si hay algo detrás. */}
                    <span className="ml-1 font-normal opacity-70">{n}</span>
                  </button>
                ))}
              </span>
            )}
          </div>

          {cargando && visitas.length === 0 ? <AgendaSkeleton /> : null}

          {!cargando && mostradas.length === 0 && !error ? (
            <div className="glass-panel grid min-h-56 place-items-center rounded-2xl px-6 text-center">
              <div>
                <CalendarIcon />
                <p className="mt-3 text-sm font-semibold text-text">
                  {query
                    ? "No hay visitas con esa búsqueda"
                    : dia
                      ? "Ese día no hay visitas"
                      : recortaProximas
                        ? "No queda ninguna visita este mes"
                        : "Este mes no hay visitas"}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {query
                    ? "Prueba con otro texto, o cambia de mes."
                    : recortaProximas && visitas.length > 0
                      ? `Las ${visitas.length} del mes ya pasaron: están en "Todo el mes".`
                      : "Aparecerán en cuanto un comercial registre el aviso en RPS."}
                </p>
              </div>
            </div>
          ) : null}

          {grupos.map((grupo) => (
            <GrupoDia
              key={grupo.fecha ?? "sin-fecha"}
              fecha={grupo.fecha}
              visitas={grupo.visitas}
              hoy={hoy}
              /* Con un día elegido la cabecera de grupo repetiría el título de
                 arriba: se calla y las fichas van seguidas. */
              conCabecera={dia === null}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function GrupoDia({
  fecha,
  visitas,
  hoy,
  conCabecera,
}: {
  fecha: string | null;
  visitas: VisitaCot[];
  hoy: string;
  conCabecera: boolean;
}) {
  const { titulo, sub } = tituloDia(fecha, hoy);
  const pendientes = visitas.filter((v) => v.estado === "pendiente").length;
  const atrasado = pendientes > 0 && Boolean(fecha && fecha < hoy);

  return (
    <section aria-label={sub ? `${titulo} · ${sub}` : titulo} className="space-y-1.5">
      {conCabecera && (
        <header className="flex items-center gap-2.5 pt-1">
          <span
            className={`h-4 w-1 shrink-0 rounded-full ${
              atrasado ? "bg-red-500" : pendientes > 0 ? "bg-brand-400" : "bg-cyan-600"
            }`}
            aria-hidden="true"
          />
          <span className="text-[13px] font-semibold text-text">{titulo}</span>
          {sub ? <span className="truncate text-[11px] text-text-muted">{sub}</span> : null}
          {atrasado ? (
            <span
              className="rounded-full bg-red-500/12 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300"
              title="Es de un día que ya pasó y sigue sin cerrarse en RPS"
            >
              Sin cerrar
            </span>
          ) : null}
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-text-muted">
            {visitas.length}
          </span>
        </header>
      )}
      {visitas.map((visita) => (
        <VisitaCard key={visita.idOrden} visita={visita} />
      ))}
    </section>
  );
}

function VisitaCard({ visita }: { visita: VisitaCot }) {
  const [abierta, setAbierta] = useState(false);
  const pendiente = visita.estado === "pendiente";
  const color = colorDe(visita.responsable);
  const tieneDetalle = Boolean(visita.solucion || visita.notas || visita.fechaAviso);

  return (
    <article
      className={`overflow-hidden rounded-xl border bg-surface/60 ${
        pendiente ? "border-border" : "border-border/60"
      }`}
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        {/* El comercial primero y con cara: es el dato con el que se habla de
            estas visitas ("la de Juan José"), y estaba al final de la fila en
            gris, en mayúsculas y del revés. */}
        <span
          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
          style={{ background: color }}
          title={visita.responsable}
          aria-hidden="true"
        >
          {inicialesDe(visita.responsable)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[13px] font-semibold text-text">{visita.responsable}</span>
            {visita.cliente && (
              <span className="min-w-0 truncate text-xs text-text-muted">
                · {visita.cliente}
              </span>
            )}
            {!pendiente && (
              <span className="rounded-full bg-cyan-600/12 px-1.5 py-0.5 text-[9px] font-bold uppercase text-cyan-700 dark:text-cyan-300">
                Hecha
              </span>
            )}
          </div>
          {/* El MOTIVO entero, sin truncar. Es la razón de que la visita
              exista: recortarlo a una línea obligaba a abrir cada una para
              saber de qué iba. */}
          <p className="mt-0.5 whitespace-pre-line text-sm leading-snug text-text">
            {visita.motivo || "Sin descripción"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] text-text-muted">
            <span title="Código de la incidencia en RPS">{visita.incidencia || "Sin código"}</span>
            {visita.pedido && <span title="Pedido enlazado">{visita.pedido}</span>}
            {visita.solucion && (
              <span className="font-sans font-semibold text-cyan-700 dark:text-cyan-300">
                {visita.solucion}
              </span>
            )}
          </div>
        </div>

        {tieneDetalle && (
          <button
            type="button"
            onClick={() => setAbierta((a) => !a)}
            aria-expanded={abierta}
            aria-label={abierta ? "Ocultar detalle" : "Ver detalle"}
            className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-surface-2 hover:text-text"
          >
            <ChevronIcon abierta={abierta} />
          </button>
        )}
      </div>

      {abierta && (
        <div className="space-y-2 border-t border-border bg-surface-2/55 px-3 py-2.5">
          {visita.notas && (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-text-muted">
                Notas
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-xs leading-5 text-text">
                {visita.notas}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] text-text-muted">
            <span>Aviso: {fmtFechaHora(visita.fechaAviso)}</span>
            <span>Estado RPS: {visita.estadoRps}</span>
            <span>Orden: {visita.idOrden}</span>
          </div>
        </div>
      )}
    </article>
  );
}

function AgendaSkeleton() {
  return (
    <div className="space-y-1.5" aria-label="Cargando agenda">
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse rounded-xl border border-border bg-surface/60 px-3 py-3">
          <div className="flex items-center gap-3">
            <div className="size-7 shrink-0 rounded-full bg-border" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 rounded bg-border" />
              <div className="h-3 w-3/4 rounded bg-border" />
            </div>
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
      <path d="M18.5 15a7 7 0 1 1-.7-7.8L20 9" strokeLinecap="round" strokeLinejoin="round" />
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
      className={`size-4 transition-transform ${abierta ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
