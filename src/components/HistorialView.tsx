"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HistorialItem, HistorialOF } from "@/lib/historial";
import type { Familia, Operario } from "@/lib/types";
import { FAMILIAS_FILTRABLES, personasConRol } from "@/lib/historial";
import { agruparPorDia } from "@/lib/historial-dias";
import { familiaMeta } from "@/lib/familia";
import { FamiliaIcon, FamiliaTag } from "./FamiliaTag";
import { HistorialDrawer } from "./HistorialDrawer";
import { SelectorFecha } from "./SelectorFecha";
import { HistorialOFsCompactas } from "./HistorialOFsCompactas";
import { HistorialTareas } from "./HistorialTareas";
import { Desplegable } from "./Desplegable";
import { OpDot, Select } from "./Select";
import { PedidoCodigo } from "./PedidoCodigo";
import { SECCIONES, SECCION_POR_DEFECTO, type SeccionId } from "@/lib/secciones";
import { fmtMin, ROL } from "@/lib/estado";

/** Fecha corta con año (dd/mm/aa) y la completa con hora para el `title`.
 *  Siempre con año: la lista baja hasta pedidos de 2024. */
function fmtFecha(iso: string): { corta: string; completa: string } {
  if (!iso) return { corta: "—", completa: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { corta: "—", completa: "" };
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  const corta = `${dd}/${mm}/${String(ano).slice(2)}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return { corta, completa: `${dd}/${mm}/${ano} a las ${hh}:${mi}` };
}

/** La API incorpora los pasos locales antes del cierre en RPS y antes de paginar. */
export type FiltrosHistorial = {
  q: string;
  desde: string;
  hasta: string;
  familia: string | null;
  /** Id del equipo: pedidos en los que trabajó esa persona. */
  operario: string | null;
  /** Fuera los pedidos sin trabajo de la sección («Solo Taller»). */
  soloSeccion: boolean;
};
export const FILTROS_HISTORIAL_INICIALES: FiltrosHistorial = {
  q: "",
  desde: "",
  hasta: "",
  familia: null,
  operario: null,
  soloSeccion: false,
};

/** Nombre corto de cada centro, para la cabecera y los pedidos de otro centro. */
const CENTRO_CORTO = { ot: "OT", diseno: "Diseño", taller: "Taller" } as const;

/** Las mismas columnas en la cabecera y en cada fila. Al buscar se añade la
 *  fecha: los resultados van por fecha del pedido y no hay separadores de día.
 *  Dos literales enteros y no uno construido: Tailwind solo compila las
 *  clases que ve escritas. */
const COLUMNAS_POR_DIA =
  "grid grid-cols-[28px_136px_minmax(0,1fr)_112px_minmax(150px,24%)_64px] items-center gap-x-3";
const COLUMNAS_BUSCANDO =
  "grid grid-cols-[28px_136px_minmax(0,1fr)_112px_minmax(150px,24%)_64px_72px] items-center gap-x-3";

export function HistorialView({
  operarios = [],
  miId = null,
  seccion = SECCION_POR_DEFECTO,
  filtros,
  onFiltros,
}: {
  /** El equipo: para el filtro por persona y para el hilo de notas del drawer. */
  operarios?: readonly Operario[];
  /** Quién soy: finalizar una fase en RPS se firma con mi código de operario. */
  miId?: string | null;
  seccion?: SeccionId;
  filtros: FiltrosHistorial;
  onFiltros: (cambio: Partial<FiltrosHistorial>) => void;
}) {
  const [items, setItems] = useState<HistorialItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [claveResultado, setClaveResultado] = useState<string | null>(null);
  const [familiasDisponibles, setFamiliasDisponibles] = useState<string[] | null>(null);
  // "Hoy" y "Ayer" de los separadores. Se fija al montar: leer el reloj en
  // cada render haría el componente impuro.
  const [hoy] = useState(() => new Date());

  // Filtros (se aplican reiniciando desde la página 0). Con valores por
  // defecto: los filtros guardados en el tablero antes de existir estos dos
  // campos no los traen.
  const { q, desde, hasta, familia, operario = null, soloSeccion = false } = filtros;
  const setQ = (q: string) => onFiltros({ q });
  const setFamilia = (familia: string | null) => onFiltros({ familia });
  const setOperario = (operario: string | null) => onFiltros({ operario });
  const setSoloSeccion = (soloSeccion: boolean) => onFiltros({ soloSeccion });

  const buscando = Boolean(q.trim());
  const equipo = operarios.filter((o) => (o.seccion ?? "ot") === seccion);

  // Clave de filtros: al cambiar, se reinicia la lista.
  const filtrosKey = `${seccion}|${q}|${desde}|${hasta}|${familia ?? ""}|${operario ?? ""}|${soloSeccion ? 1 : 0}`;
  const resultadosVigentes = claveResultado === filtrosKey;
  const itemsVisibles = resultadosVigentes ? items : [];
  const hayFiltros = Boolean(q.trim() || desde || hasta || familia || operario || soloSeccion);

  // Secuencia de peticiones: permite descartar respuestas obsoletas cuando
  // una petición más reciente (p.ej. tras cambiar filtros rápido) responde
  // fuera de orden.
  const reqSeq = useRef(0);

  const cargar = useCallback(
    async (pageAcargar: number, reemplazar: boolean) => {
      const seq = ++reqSeq.current;
      setCargando(true);
      setError(false);
      try {
        const params = new URLSearchParams({ page: String(pageAcargar) });
        params.set("seccion", seccion);
        if (q.trim()) params.set("q", q.trim());
        if (desde) params.set("desde", desde);
        if (hasta) params.set("hasta", hasta);
        if (familia) params.set("familia", familia);
        if (operario) params.set("operario", operario);
        if (soloSeccion) params.set("soloSeccion", "1");
        const r = await fetch(`/api/historial?${params}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as { pedidos: HistorialItem[]; hasMore: boolean; familias?: string[] };
        if (seq !== reqSeq.current) return; // respuesta obsoleta: la ignoramos
        setItems((prev) => (reemplazar ? data.pedidos : [...prev, ...data.pedidos]));
        // Las familias del panel presentes con los demás filtros (las da la
        // lista en memoria). Sin ellas —la consulta de respaldo—, las de siempre.
        if (reemplazar) setFamiliasDisponibles(data.familias ?? null);
        setHasMore(data.hasMore);
        setPage(pageAcargar);
        setClaveResultado(filtrosKey);
      } catch {
        if (seq !== reqSeq.current) return;
        setError(true);
        if (reemplazar) setItems([]);
        setClaveResultado(filtrosKey);
      } finally {
        if (seq === reqSeq.current) setCargando(false);
      }
    },
    [seccion, q, desde, hasta, familia, operario, soloSeccion, filtrosKey],
  );

  // Al cambiar filtros (o al montar) recarga desde la página 0, con debounce
  // para no lanzar una query pesada por cada tecla del buscador.
  useEffect(() => {
    reqSeq.current++;
    const t = setTimeout(() => cargar(0, true), 300);
    return () => clearTimeout(t);
  }, [cargar]);

  // Scroll infinito: un centinela al final dispara la siguiente página.
  const sentinela = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinela.current;
    if (!el || !hasMore || cargando || error || !resultadosVigentes) return;
    const io = new IntersectionObserver((entradas) => {
      if (entradas[0].isIntersecting) cargar(page + 1, false);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, cargando, error, page, cargar, resultadosVigentes]);

  const columnas = buscando ? COLUMNAS_BUSCANDO : COLUMNAS_POR_DIA;
  const dias = buscando ? null : agruparPorDia(itemsVisibles, { hayMas: hasMore, hoy });
  const fila = (it: HistorialItem) => (
    <FilaHistorial key={`${seccion}:${it.pedido}`} item={it} onOpen={setAbierto} seccion={seccion} columnas={columnas} conFecha={buscando} />
  );

  return (
    <div className="space-y-3">
      {/* ── Filtros ───────────────────────────────────────────────────────
          Una sola fila: buscador, familia, persona, fechas y el interruptor
          de la sección. Se combinan: "de Iván, remolques, la última semana". */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
        <div className="flex min-w-56 flex-1 flex-col text-xs text-text-muted">
          <label htmlFor="buscar-historial">Buscar en el Historial</label>
          <span className="relative mt-1">
            <input
              id="buscar-historial"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pedido, OF, cliente o descripción…"
              className="w-full rounded-lg border border-border bg-surface py-1 pl-2 pr-8 text-sm text-text"
            />
            {q && (
              <button type="button" aria-label="Vaciar la búsqueda del Historial" onClick={() => setQ("")}
                className="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-text-muted hover:bg-surface-2">
                ✕
              </button>
            )}
          </span>
        </div>
        <label className="flex flex-col text-xs text-text-muted">
          Familia
          <span className="mt-1">
            <Select
              value={familia}
              onChange={setFamilia}
              placeholder="Todas"
              etiquetaVaciar="Todas las familias"
              // Las mismas familias que el panel de Sin asignar, y solo las que
              // hay con los demás filtros puestos. La elegida se conserva
              // aunque ya no esté, para poder quitarla.
              options={[...new Set([...(familiasDisponibles ?? FAMILIAS_FILTRABLES), ...(familia ? [familia] : [])])].map((fam) => ({
                value: fam,
                label: familiaMeta(fam as Familia).label ?? fam,
                icon: <FamiliaIcon familia={fam as Familia} className="size-3.5" />,
              }))}
            />
          </span>
        </label>
        {/* Por persona: los pedidos en los que imputó tiempo en RPS. */}
        <label className="flex flex-col text-xs text-text-muted">
          Quién
          <span className="mt-1">
            <Select
              value={operario}
              onChange={setOperario}
              placeholder="Todo el equipo"
              etiquetaVaciar="Todo el equipo"
              options={equipo.map((o) => ({
                value: o.id,
                label: o.nombre,
                icon: <OpDot color={o.color} iniciales={o.iniciales} />,
              }))}
            />
          </span>
        </label>
        {/* "Pasado a Producción entre…": el MISMO calendario que la barra de
            Pendientes. Eran dos `input[type=date]` y los pintaba el navegador a
            su manera —fondo blanco, su propia tipografía y su «Borrar / Hoy»—
            en medio de una barra que es toda nuestra. */}
        <div className="flex flex-col text-xs text-text-muted">
          Pasado a Producción
          <span className="mt-1 flex items-center">
            <SelectorFecha
              desde={desde}
              hasta={hasta}
              onCambiar={(d, h) => onFiltros({ desde: d, hasta: h })}
            />
          </span>
        </div>
        {/* Un chip que se queda pulsado, como los filtros del tablero: la
            casilla del navegador desentonaba con el resto de la barra. */}
        <button
          type="button"
          onClick={() => setSoloSeccion(!soloSeccion)}
          aria-pressed={soloSeccion}
          title={`Deja fuera los pedidos sin trabajo de ${CENTRO_CORTO[seccion]}`}
          className={`glass-chip self-end rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            soloSeccion
              ? "glass-chip-activo text-brand-700 dark:text-brand-300"
              : "text-text-muted hover:text-text"
          }`}
        >
          Solo con trabajo de {CENTRO_CORTO[seccion]}
        </button>
        {hayFiltros && (
          <button
            onClick={() => {
              onFiltros(FILTROS_HISTORIAL_INICIALES);
            }}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text-muted hover:border-border-strong hover:text-text"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {error && resultadosVigentes && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-text">
          No se pudo cargar el historial.
          <button onClick={() => cargar(0, true)} className="rounded-lg bg-surface px-2 py-1 text-xs font-semibold ring-1 ring-border hover:bg-surface-2">
            Reintentar
          </button>
        </div>
      )}

      {!error && resultadosVigentes && itemsVisibles.length === 0 && !cargando && (
        <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border px-6 text-center">
          <div>
            <p className="text-sm font-semibold text-text">
              {hayFiltros ? "Ningún pedido pasa los filtros" : "El historial está vacío"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-text-muted">
              {hayFiltros
                ? "Prueba con otro texto, otra persona o amplía el periodo."
                : `Aquí aparecen los pedidos terminados en ${SECCIONES[seccion].nombre}; si no tienen tareas de esta sección, cuando termina el resto de su trabajo.`}
            </p>
          </div>
        </div>
      )}

      {/* Al buscar no hay días: se dice cuántos hay y por qué fecha van. */}
      {buscando && !error && itemsVisibles.length > 0 && (
        <p className="text-[11px] text-text-muted">
          {itemsVisibles.length} pedido{itemsVisibles.length === 1 ? "" : "s"}
          {hasMore ? " y más al bajar" : ""} · por fecha del pedido, más recientes primero
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {itemsVisibles.length > 0 && (
          <div aria-hidden="true" className={`${columnas} border-b border-border bg-surface-2 px-3 py-2 text-[11px] font-semibold text-text-muted`}>
            <span /><span>Pedido</span><span>Cliente</span><span>Familia</span><span>Quién</span>
            <span className="text-right">Tiempo {CENTRO_CORTO[seccion]}</span>
            {buscando && <span>Fecha</span>}
          </div>
        )}
        {dias
          ? dias.map((dia, i) => (
              <section key={`${dia.clave}-${i}`} aria-label={dia.titulo}>
                {/* El separador del día: cuántos salieron y cuánto tiempo de la
                    sección llevaron. Con más páginas por cargar, el último día
                    puede estar a medias y lo dice con "+". */}
                <h3 className="flex items-baseline gap-2 border-b border-border bg-surface-2/60 px-3 py-1.5 text-[11px] font-semibold text-text">
                  {dia.titulo}
                  <span className="font-normal text-text-muted">
                    · {dia.items.length}{dia.incompleto ? "+" : ""} pedido{dia.items.length === 1 && !dia.incompleto ? "" : "s"}
                    {dia.minutos > 0 && ` · ${fmtMin(dia.minutos)} de ${CENTRO_CORTO[seccion]}`}
                  </span>
                </h3>
                {dia.items.map(fila)}
              </section>
            ))
          : itemsVisibles.map(fila)}
      </div>

      {(cargando || !resultadosVigentes) && <p role="status" className="py-2 text-center text-xs text-text-muted">{buscando ? "Buscando en todo el historial…" : "Cargando…"}</p>}
      <div ref={sentinela} className="h-1" />

      <HistorialDrawer
        seccion={seccion}
        pedido={abierto}
        operarios={operarios}
        miId={miId}
        onClose={() => setAbierto(null)}
      />
    </div>
  );
}

/** Quién trabajó en lo que cuenta para la fila, de más a menos horas. Solo el
 *  nombre: el tiempo de cada uno va en el `title` y en el desplegable, y el
 *  total en su columna. Con nombre y tiempo aquí, en una fila de una persona
 *  el mismo número salía dos veces.
 *
 *  Si el pedido no tiene nada de la sección, delante va el centro ("Taller ·")
 *  y la fila entera va en gris (ver FilaHistorial). */
function Quien({ item }: { item: HistorialItem }) {
  const autores = (item.autores ?? []).filter(Boolean);
  // Quien planteó primero y con su punto de color, pero solo si el rol consta:
  // con dos personas a la misma hora, el orden por minutos dejaba el pedido a
  // nombre de quien lo repasó.
  const personas = personasConRol(
    item.personas ?? [],
    autores,
    item.revisores ?? [],
    item.rolesRegistrados === true,
  );
  const otros = item.otrosCentros ?? [];
  const centro = otros.length > 0 ? `${otros.map((c) => CENTRO_CORTO[c]).join(" y ")} · ` : "";
  const aviso = otros.length > 0 ? "Sin tareas de la sección: es trabajo de otro centro. " : "";
  if (personas.length > 0) {
    const conRol = (p: (typeof personas)[number]) =>
      `${p.nombre} ${fmtMin(p.min)}${p.rol ? ` (${p.rol === "plantear" ? "planteó" : "revisó"})` : ""}`;
    return (
      <span
        className="block truncate"
        title={`${aviso}Tiempo imputado en RPS: ${personas.map(conRol).join(" · ")}`}
      >
        {centro}
        <span className={otros.length > 0 ? "" : "text-text"}>
          {personas.slice(0, 2).map((p, i) => (
            <span key={p.nombre}>
              {i > 0 && " · "}
              {p.rol && (
                <span
                  aria-hidden
                  className="mr-1 inline-block size-1.5 rounded-full align-middle"
                  style={{ background: ROL[p.rol].color }}
                />
              )}
              {p.nombre}
            </span>
          ))}
        </span>
        {personas.length > 2 && ` +${personas.length - 2}`}
      </span>
    );
  }
  // Registrado en CoordinaOT pero sin una hora en RPS: el nombre, que es todo
  // lo que se sabe.
  if (autores.length > 0) {
    return (
      <span className="block truncate" title={`${aviso}Registrado en CoordinaOT, sin horas imputadas en RPS`}>
        {centro}<span className="text-text">{autores.join(" y ")}</span>
      </span>
    );
  }
  if (item.pasadoPor) {
    return (
      <span className="block truncate" title={`${item.pasadoPor} pulsó "pasar a Producción"; no consta quién lo planteó.`}>
        {centro}Lo pasó {item.pasadoPor}
      </span>
    );
  }
  return <span className="block truncate italic">{centro}Sin horas registradas</span>;
}

/** El código abre la ficha; el resto de la fila despliega las OF. */
function FilaHistorial({
  item,
  onOpen,
  seccion,
  columnas,
  conFecha,
}: {
  item: HistorialItem;
  onOpen: (pedido: string) => void;
  seccion: SeccionId;
  columnas: string;
  /** Al buscar: sin separadores de día, la fecha va en su columna. */
  conFecha: boolean;
}) {
  const [desplegado, setDesplegado] = useState(false);
  const [ofs, setOfs] = useState<HistorialOF[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  // Las OFs se piden al desplegar por primera vez y se quedan cacheadas: abrir
  // y cerrar no repite la consulta. Va en el handler y no en un efecto porque
  // desplegar es un evento de usuario, no una sincronización con nada externo.
  const alternar = useCallback(async () => {
    const abre = !desplegado;
    setDesplegado(abre);
    if (!abre || ofs || cargando) return;
    setCargando(true);
    setError(false);
    try {
      const r = await fetch(`/api/historial/${item.pedido}?seccion=${seccion}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { ofs: HistorialOF[] };
      setOfs(d.ofs);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [desplegado, ofs, cargando, item.pedido, seccion]);

  // El momento real en que se pasó a Producción es el de CoordinaOT; el de RPS
  // es cuando OLANET registró el cambio y puede ir por detrás.
  const pasado = fmtFecha(item.pasadoAt ?? item.finalizada);
  const origen = item.pasadoAt ? "Marcado en CoordinaOT" : "Según el cambio de estado en RPS";
  const tituloPasado = item.pasadoPor
    ? `${origen}: ${pasado.completa} · lo pasó ${item.pasadoPor}`
    : `${origen}: ${pasado.completa}`;

  const familias = item.familias ?? [];
  // Sin nada de la sección: en gris, para que no compita con el trabajo
  // propio. Con los colores de texto secundario y no con opacidad, que bajaría
  // el contraste por debajo de lo legible.
  const deOtroCentro = (item.otrosCentros?.length ?? 0) > 0;

  return (
    <div className="relative border-b border-border last:border-b-0">
      {desplegado && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-brand-500" />}
      <div className={`relative ${columnas} px-3 py-1 ${desplegado ? "bg-brand-500/10" : "hover:bg-surface-2"}`}>
        {/* Fondo y código son botones hermanos: un clic produce una sola acción. */}
        <button
          type="button"
          onClick={alternar}
          aria-expanded={desplegado}
          aria-controls={`ofs-${seccion}-${item.pedido}`}
          aria-label={`${desplegado ? "Plegar" : "Desplegar"} ${item.pedido}`}
          title={tituloPasado}
          className="absolute inset-0 cursor-pointer rounded-sm focus-visible:z-10"
        />
        <span aria-hidden="true" className="pointer-events-none grid size-6 place-items-center text-text-muted">
          <svg viewBox="0 0 24 24" className={`size-3.5 transition-transform motion-reduce:transition-none ${desplegado ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        {/* El código y, pegado a él, cuántas OF si son varias ("este pedido,
            de 2 OF"). En su propia columna, con "OF" en la cabecera, dejaba un
            rótulo sobre un hueco vacío en casi todas las filas. */}
        <div className="pointer-events-none flex min-w-0 items-baseline gap-1.5">
          <PedidoCodigo codigo={item.pedido} onAbrir={() => onOpen(item.pedido)} />
          {item.nOf > 1 && (
            <span
              className="shrink-0 text-[11px] font-medium text-text-muted"
              title={`${item.nOf} órdenes de fabricación en todo el pedido`}
            >
              {item.nOf} OF
            </span>
          )}
        </div>
        <span
          className={`pointer-events-none min-w-0 truncate text-[11px] ${deOtroCentro ? "text-text-muted" : "text-text"}`}
          title={[item.cliente, item.negocio].filter(Boolean).join(" · ")}
        >
          {item.cliente ?? "—"}
          {item.negocio && <span className="text-text-muted"> · {item.negocio}</span>}
          {item.estadoActual && <span className="font-semibold text-amber-700 dark:text-amber-300"> · {item.estadoActual}</span>}
        </span>
        <span className="pointer-events-none flex min-w-0 items-center gap-1 overflow-hidden" title={familias.join(", ")}>
          {familias.slice(0, 1).map((f) => <FamiliaTag key={f} familia={f} />)}
          {familias.length > 1 && <span className="text-[10px] text-text-muted">+{familias.length - 1}</span>}
        </span>
        <div className="pointer-events-none min-w-0 text-[11px] leading-4 text-text-muted">
          <Quien item={item} />
        </div>
        <div
          className={`pointer-events-none text-right font-mono text-[11px] tabular-nums ${deOtroCentro ? "text-text-muted" : "text-text"}`}
          title={item.minutos === undefined
            ? "No se pudo leer el tiempo imputado"
            : `Tiempo imputado en RPS a las tareas de ${deOtroCentro ? item.otrosCentros!.map((c) => CENTRO_CORTO[c]).join(" y ") : CENTRO_CORTO[seccion]}`}
        >
          {item.minutos === undefined ? "—" : fmtMin(item.minutos)}
        </div>
        {conFecha && (
          <div
            className="pointer-events-none text-[11px] leading-4 text-text-muted"
            title={`${item.fechaPedido ? `Pedido del ${fmtFecha(item.fechaPedido).corta}. ` : ""}${tituloPasado}`}
          >
            {item.fechaPedido ? fmtFecha(item.fechaPedido).corta : pasado.corta}
          </div>
        )}
      </div>

      {/* Envuelto y no `{desplegado && …}`: si React lo quitara al pulsar, el
          contenido desaparecería de golpe y no habría nada que animar. Cerrado
          no ocupa nada (`Desplegable` devuelve null). */}
      <div id={`ofs-${seccion}-${item.pedido}`}>
      <Desplegable abierto={desplegado}>
        <div className="border-t border-border px-3 py-2">
          {cargando && <p className="py-1 text-xs text-text-muted">Cargando OF…</p>}
          {error && <p className="py-1 text-xs text-red-500">No se pudieron cargar las OF.</p>}
          {/* Las OF en las mismas columnas que la fila del pedido, y el botón
              en la línea de la primera, no en una para él solo. */}
          {ofs && (
            <HistorialOFsCompactas
              ofs={ofs}
              seccion={seccion}
              columnas={columnas}
              accion={<HistorialTareas pedido={item.pedido} ofs={ofs} seccion={seccion} className="-my-0.5" />}
            />
          )}
        </div>
      </Desplegable>
      </div>
    </div>
  );
}
