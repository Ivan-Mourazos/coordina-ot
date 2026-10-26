"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  agruparVisitasPorFecha,
  type VisitaCot,
  type VisitasCotPagina,
} from "@/lib/visitas-cot";
import { inicialesDe } from "@/lib/nombre-persona";
import { tituloDia } from "@/lib/fechas";
import { hoyISO } from "@/lib/types";
import { MESES_CORTOS } from "@/lib/calendario";
import {
  CalendarioVisitas,
  primerDiaDelMes,
  ultimoDiaDelMes,
  type DiaConVisitas,
} from "./CalendarioVisitas";
import { Desplegable } from "./Desplegable";
import { BloqueLista } from "./BloqueLista";
import { tintaSobre } from "@/lib/tinta";

// ─── Agenda de visitas COT ───────────────────────────────────────────────────
// Un comercial pide que Oficina Técnica le acompañe a ver una obra. Lo único
// que se viene a mirar aquí es QUÉ DÍA, QUIÉN y PARA QUÉ, y antes eso estaba
// dentro de una tabla de cinco columnas con el código de incidencia primero, el
// texto crudo de RPS en medio —encabezado, motivo y línea de OF, todo seguido y
// truncado— y el comercial en MAYÚSCULAS Y DEL REVÉS al final.
//
// Ahora son dos piezas: un calendario del mes que dice qué días hay algo, y a
// su derecha esas visitas en una línea cada una, agrupadas por día. El
// calendario es la pregunta que se hace de verdad ("¿qué tengo esta semana?");
// la lista, la respuesta.
//
// La lista usa `BloqueLista` y `Desplegable`, como las demás pestañas; la fila
// propia permite leer las notas sin abrir un detalle ni teñirlo de dorado.

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

/** «Avisado el 4 sep, 11:32». Era «Aviso: 04/09/2026, 11:32», que es la fecha
 *  escrita para una máquina: cuatro cifras de año que nadie necesita —una
 *  visita se avisa días antes, no años— y un cero a la izquierda que solo
 *  alarga. */
export function fmtAviso(iso: string | null): string {
  if (!iso) return "Sin fecha de aviso";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sin fecha de aviso";
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `Avisado el ${d.getDate()} ${MESES_CORTOS[d.getMonth()]}, ${hh}:${mi}`;
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
  // El mismo hsl(h 55% 42%) de siempre, pero en hex: `tintaSobre` necesita
  // leerlo para elegir las iniciales. Con blanco fijo, los tonos amarillos y
  // verdes se quedaban a 2,6:1, y no hay luminosidad de un hsl que aguante
  // blanco en todos los tonos sin volver pardos a los demás.
  const s = 0.55;
  const l = 0.42;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
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

export function VisitasCotView({
  base = "/api/visitas-cot",
  sondeo = true,
  busqueda,
}: {
  base?: string;
  /** Refrescarse solo cada minuto. ENCENDIDO para el equipo, que tiene esto
   *  abierto toda la mañana y quiere ver entrar las visitas nuevas.
   *
   *  La consulta sin login lo apaga: ahí lo mira media empresa a la vez, y
   *  cada pestaña abierta serían preguntas a RPS cada minuto por algo que
   *  nadie está esperando ver cambiar. Quien quiera lo último, actualiza. */
  sondeo?: boolean;
  /** El texto a buscar, cuando lo escribe otro. La consulta sin login tiene un
   *  solo buscador arriba para las dos pestañas: con esto, esta vista esconde
   *  el suyo y usa ese. Sin él, el de siempre. */
  busqueda?: string;
} = {}) {
  const [mes, setMes] = useState(() => primerDiaDelMes(hoyISO()));
  const [dia, setDia] = useState<string | null>(null);
  const [ambito, setAmbito] = useState<Ambito>("proximas");
  const [query, setQuery] = useState("");
  // El buscador propio o el de fuera: el de la consulta sin login manda.
  const buscado = busqueda ?? query;
  const queryDebounced = useDebounced(buscado.trim(), 300);
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
        const res = await fetch(`${base}?${params}`, { cache: "no-store" });
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
  }, [mes, queryDebounced, base]);

  useEffect(() => {
    const id = setTimeout(() => void cargar(), 0);
    return () => clearTimeout(id);
  }, [cargar]);

  useEffect(() => {
    if (!sondeo) return;
    const id = setInterval(() => void cargar(), REFRESCO_MS);
    return () => clearInterval(id);
  }, [cargar, sondeo]);

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
    <section className="w-full space-y-4">
      {/* Una barra como la de las demás pestañas, no una portada. Era una
          tarjeta con antetítulo espaciado ("AGENDA COT · SOLO LECTURA") y un
          título de 20 px: la única pestaña con ese estilo, y con el buscador y
          el botón más altos y con otra letra que los del resto de la web. La
          pestaña ya dice dónde estás; el título se queda para los lectores de
          pantalla, y "solo lectura" sigue a la vista porque sí informa: aquí
          las visitas no se tocan. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="sr-only">Visitas con Oficina Técnica</h1>
        {/* Sin buscador propio cuando lo escribe otro (la consulta sin login):
            dos cajas de buscar en la misma pantalla no dicen cuál manda. */}
        {busqueda === undefined && (
          <label className="relative min-w-56 flex-1 sm:max-w-md">
            <span className="sr-only">Buscar visitas</span>
            <SearchIcon />
            <input
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Comercial, cliente, pedido o incidencia…"
              className="campo-hundido w-full rounded-lg py-1.5 pl-8 pr-3 text-xs text-text outline-none placeholder:text-text-muted"
            />
          </label>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="hidden text-[11px] text-text-muted sm:inline">
            Solo lectura · {fmtActualizacion(refreshedAt)}
          </span>
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={cargando}
            className="chip-3d inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-text disabled:cursor-wait disabled:opacity-55"
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
            className="chip-3d ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold"
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

        <div className="min-w-0 space-y-4">
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
              <span className="tira-3d glass-chip ml-auto inline-flex rounded-lg p-1" role="group" aria-label="Qué parte del mes">
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
                        ? "pestana-activa"
                        : "text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
                    }`}
                  >
                    {texto}
                    {/* El número delante de pulsar: sin él, "Todo el mes" es un
                        salto a ciegas y no se sabe si hay algo detrás. */}
                    <span className="ml-1 font-normal">{n}</span>
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
                  {buscado
                    ? "No hay visitas con esa búsqueda"
                    : dia
                      ? "Ese día no hay visitas"
                      : recortaProximas
                        ? "No queda ninguna visita este mes"
                        : "Este mes no hay visitas"}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {buscado
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
    <section aria-label={sub ? `${titulo} · ${sub}` : titulo}>
      <BloqueLista
        columnas={COLUMNAS_VISITA}
        // Cada visita, su tarjeta, como las filas de Pendientes, Revisiones y
        // el Historial: iban todas dentro de una caja por día, la única
        // pestaña con las filas pegadas y separadas por raya.
        sinCaja
        rotulo={
          conCabecera
            ? {
                texto: titulo,
                claseDot: atrasado ? "bg-red-500" : pendientes > 0 ? "bg-brand-400" : "bg-cyan-600",
                sufijo: (
                  <>
                    {sub && <span className="mr-1">{sub}</span>}
                    · {visitas.length} visita{visitas.length === 1 ? "" : "s"}
                    {atrasado && (
                      <span
                        className="ml-1.5 rounded-full bg-red-500/12 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300"
                        title="Es de un día que ya pasó y sigue sin cerrarse en RPS"
                      >
                        Sin cerrar
                      </span>
                    )}
                  </>
                ),
              }
            : undefined
        }
      >
        {visitas.map((visita) => (
          <VisitaCard key={visita.idOrden} visita={visita} />
        ))}
      </BloqueLista>
    </section>
  );
}

/** El comercial y los códigos miden lo que contienen: un pedido ausente no
 *  reserva una columna vacía. El motivo recibe el espacio que queda. En móvil
 *  pasan a renglones separados para no cortar los códigos. */
const COLUMNAS_VISITA =
  "grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-2 md:grid-cols-[24px_fit-content(15rem)_minmax(0,1fr)_auto]";

export function VisitaCard({ visita }: { visita: VisitaCot }) {
  const [abierta, setAbierta] = useState(false);
  const [todasLasNotas, setTodasLasNotas] = useState(false);
  // Qué campos de la fila salen cortados. Si no se corta nada y hay notas, la
  // fila ya lo dice todo y no se ofrece desplegar.
  const [recortados, setRecortados] = useState<ReadonlySet<string>>(new Set());
  const resumenRef = useRef<HTMLDivElement>(null);
  const notas = (visita.notas ?? "").split(/\r?\n/).map((nota) => nota.trim()).filter(Boolean);
  const notasVisibles = todasLasNotas ? notas : notas.slice(0, 3);
  const fechaAviso = fmtAviso(visita.fechaAviso);
  // RPS entrega las notas como texto con saltos de línea, sin fechas propias.
  // La fecha que acompaña a cada una sigue siendo la del aviso de la visita.
  const fechaNota = fechaAviso.replace(/^Avisado el /, "");
  // Si ya se ve todo, abrir solo repetiría la fila. Medimos el recorte real:
  // cambia con el ancho de pantalla, no con un número arbitrario de letras.
  useEffect(() => {
    const resumen = resumenRef.current;
    if (!resumen) return;
    const medir = () => {
      const cortados = Array.from(resumen.querySelectorAll<HTMLElement>("[data-resumen-visita]"))
        .filter((e) => e.scrollWidth > e.clientWidth || e.scrollHeight > e.clientHeight)
        .map((e) => e.dataset.resumenVisita ?? "");
      setRecortados((antes) =>
        antes.size === cortados.length && cortados.every((c) => antes.has(c)) ? antes : new Set(cortados),
      );
    };
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(resumen);
    return () => observer.disconnect();
  }, [visita.responsable, visita.cliente, visita.motivo, visita.solucion]);
  const tieneDetalle = notas.length === 0 || recortados.size > 0;
  const pendiente = visita.estado === "pendiente";
  const color = colorDe(visita.responsable);
  // «Hecha» ya cuenta que la consulta se realizó. Conservamos lo que viene
  // después («paso pedido», «volver a la instalación»...), y el texto original
  // sigue entero tanto al posar el ratón como al abrir la visita.
  const solucionResumen = !pendiente
    ? visita.solucion?.replace(/^consulta realizada,\s*/i, "")
    : visita.solucion;
  // No es un dato: es la costura entre la fila y su detalle. El id interno de
  // la orden no lo lee nadie y no hace falta —a diferencia del código de
  // pedido en las demás listas— para que la fila y su detalle se encuentren.
  const idDetalle = useId();

  return (
    <div className="relative mb-1.5 overflow-hidden rounded-lg bloque-3d last:mb-0">
      <div
        ref={resumenRef}
        className={`relative ${COLUMNAS_VISITA} px-3 py-1.5 hover:bg-surface-2`}
      >
        {tieneDetalle && (
          <button
            type="button"
            onClick={() => setAbierta((a) => !a)}
            aria-expanded={abierta}
            aria-controls={idDetalle}
            aria-label={`${abierta ? "Plegar" : "Desplegar"} la visita de ${visita.responsable}`}
            className="absolute inset-0 cursor-pointer rounded-sm focus-visible:z-10 focus-visible:outline-offset-[-2px]!"
            title={[
        visita.responsable,
        visita.cliente,
        visita.motivo || "Sin motivo escrito",
        visita.solucion,
        visita.incidencia,
        visita.pedido,
            ].filter(Boolean).join("\n")}
          />
        )}
        <span aria-hidden="true" className="pointer-events-none grid size-6 place-items-center text-text-muted">
          {tieneDetalle && (
            <svg viewBox="0 0 24 24" className={`size-3.5 transition-transform motion-reduce:transition-none ${abierta ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
          {/* El comercial primero y con cara: es el dato con el que se habla de
              estas visitas ("la de Juan José"). */}
          <span className="pointer-events-none col-start-2 flex min-w-0 items-center gap-2 py-1 md:col-auto">
            <span
              className="grid size-6 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
              style={{ background: color, color: tintaSobre(color) }}
              aria-hidden="true"
            >
              {inicialesDe(visita.responsable)}
            </span>
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span data-resumen-visita="responsable" className="min-w-0 shrink-0 max-w-36 truncate text-[12px] font-semibold text-text">
                {visita.responsable}
              </span>
              {visita.cliente && (
                <span data-resumen-visita="cliente" className="min-w-0 truncate text-[11px] text-text-muted">{visita.cliente}</span>
              )}
            </span>
          </span>
          {/* Dos líneas bastan para orientarse sin que un comentario largo
              estire toda la agenda. El detalle y el título lo guardan entero. */}
          <span className="pointer-events-none col-start-2 min-w-0 py-1 text-[13px] leading-snug text-text md:col-auto">
            <span data-resumen-visita="motivo" className="line-clamp-2 break-words">
              {visita.motivo || "Sin motivo escrito"}
            </span>
          </span>
          <span className="pointer-events-none col-start-2 flex min-w-0 items-center gap-2 whitespace-nowrap py-1 text-[10px] md:col-auto md:justify-end">
            {!pendiente && (
              <span className="rounded-full bg-cyan-600/12 px-1.5 py-0.5 text-[10px] font-bold uppercase text-cyan-700 dark:text-cyan-300">
                Hecha
              </span>
            )}
            {visita.solucion && (
              <span data-resumen-visita="solucion" className="max-w-32 truncate text-[11px] font-semibold lowercase text-cyan-700 first-letter:uppercase dark:text-cyan-300">
                {solucionResumen}
              </span>
            )}
            {visita.incidencia && (
              <span className="shrink-0 whitespace-nowrap font-mono text-text-muted" title="Código de la incidencia en RPS">
                {visita.incidencia}
              </span>
            )}
            {visita.pedido && (
              <span className="shrink-0 whitespace-nowrap font-mono text-text-muted" title="Pedido enlazado">
                {visita.pedido}
              </span>
            )}
          </span>
        {/* La segunda fila comparte columnas con el comentario: las notas no
            desplazan al comercial ni añaden altura cuando no existen. */}
        {notas.length > 0 && (
          <div className="relative col-start-2 min-w-0 text-[12px] leading-4 text-text md:col-start-3 md:col-end-5">
            {notasVisibles.map((nota, indice) => (
              <p key={indice} className="flex items-baseline gap-1" title={nota}>
                <span className="line-clamp-2 min-w-0 break-words">{nota}</span>
                <span className="shrink-0 whitespace-nowrap text-[11px] text-text-muted">· {fechaNota}</span>
              </p>
            ))}
            {notas.length > 3 && (
              <button
                type="button"
                aria-expanded={todasLasNotas}
                onClick={() => setTodasLasNotas((todas) => !todas)}
                className="cursor-pointer text-[11px] text-text-muted underline-offset-2 hover:text-text hover:underline"
              >
                {todasLasNotas ? "Menos notas" : `+${notas.length - 3} notas`}
              </button>
            )}
          </div>
        )}
      </div>
      <div id={idDetalle}>
        <Desplegable abierto={tieneDetalle && abierta}>
        {/* UNA FICHA CON RÓTULOS, cada dato con su nombre delante y siempre
            en el mismo orden. Antes eran renglones sueltos sin rótulo —el
            comercial, el cliente, el comentario— y no se sabía qué era cada
            cosa (Iván, 16/10/2026: «que ocupe una línea o dos más, pero que
            se entienda»). Las notas no van: ya se leen en la fila.
            Se fueron el id de la orden y el código crudo del estado de RPS.
            El primero no lo usa nadie para hablar de una visita; el segundo
            es el mismo dato que la píldora "Hecha", escrito para RPS. */}
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-t border-(--fila-borde) px-3 py-2.5 text-xs">
          <DatoVisita rotulo="Comercial">{visita.responsable}</DatoVisita>
          {visita.cliente && <DatoVisita rotulo="Cliente">{visita.cliente}</DatoVisita>}
          <DatoVisita rotulo="Comentario">{visita.motivo || "Sin motivo escrito"}</DatoVisita>
          {visita.solucion && <DatoVisita rotulo="Solución">{visita.solucion}</DatoVisita>}
          {visita.incidencia && (
            <DatoVisita rotulo="Incidencia" mono>{visita.incidencia}</DatoVisita>
          )}
          {visita.pedido && <DatoVisita rotulo="Pedido" mono>{visita.pedido}</DatoVisita>}
          <DatoVisita rotulo="Aviso">{fechaAviso.replace(/^Avisado el /, "")}</DatoVisita>
        </dl>
        </Desplegable>
      </div>
    </div>
  );
}

function DatoVisita({ rotulo, mono = false, children }: { rotulo: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <>
      <dt className="pt-px text-[10px] font-semibold uppercase tracking-wider text-text-muted">{rotulo}</dt>
      <dd className={`min-w-0 whitespace-pre-wrap break-words leading-5 text-text ${mono ? "font-mono" : ""}`}>
        {children}
      </dd>
    </>
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
      className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted"
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
