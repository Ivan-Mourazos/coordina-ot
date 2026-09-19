"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HistorialItem, HistorialOF } from "@/lib/historial";
import type { Familia, Operario } from "@/lib/types";
import { FAMILIAS_FILTRABLES } from "@/lib/historial";
import { agruparPorDia } from "@/lib/historial-dias";
import { CENTRO_CORTO } from "@/lib/historial-centros";
import { familiaMeta } from "@/lib/familia";
import { FamiliaIcon, FamiliaTag } from "./FamiliaTag";
import { HistorialDrawer } from "./HistorialDrawer";
import { SelectorFecha } from "./SelectorFecha";
import { Quien } from "./HistorialQuien";
import { HistorialOFsCompactas } from "./HistorialOFsCompactas";
import { OpDot, Select } from "./Select";
import { PedidoCodigo } from "./PedidoCodigo";
import { FilaDesplegable } from "./FilaDesplegable";
import { BloqueLista } from "./BloqueLista";
import { SECCIONES, SECCION_POR_DEFECTO, type SeccionId } from "@/lib/secciones";
import { fmtMin } from "@/lib/estado";
import { negocioAparte } from "@/lib/negocio";

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
  // ENCENDIDO de salida: lo que se viene a ver aquí es el trabajo de tu
  // sección. Los pedidos que solo tocó Taller salían mezclados y había que
  // apagarlos a mano cada vez; quien los quiera, los enciende.
  soloSeccion: true,
};

/** Las mismas columnas en la cabecera y en cada fila. Al buscar se añade la
 *  fecha: los resultados van por fecha del pedido y no hay separadores de día.
 *  Cliente y "quién" llevan TOPE y el sobrante va a una columna vacía al
 *  final: en un monitor ancho, con el cliente a `1fr`, la familia y el tiempo
 *  quedaban a más de 1.000 px del pedido del que hablaban.
 *  Dos literales enteros y no uno construido: Tailwind solo compila las
 *  clases que ve escritas. */
const COLUMNAS_POR_DIA =
  "grid grid-cols-[28px_136px_minmax(0,36rem)_112px_minmax(150px,22rem)_64px_1fr] items-center gap-x-3";
const COLUMNAS_BUSCANDO =
  "grid grid-cols-[28px_136px_minmax(0,36rem)_112px_minmax(150px,22rem)_64px_72px_1fr] items-center gap-x-3";

/** División entre grupos de filtros: la misma raya que la barra de Pendientes. */
function SeparadorFiltros() {
  return <span aria-hidden className="h-5 w-px shrink-0 bg-[var(--glass-border)]" />;
}

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
  // Cuántos pedidos tiene cada día en la consulta entera. Lo manda el servidor
  // desde la lista en memoria: sin él, el separador contaba lo cargado y su
  // número crecía según bajabas.
  const [porDia, setPorDia] = useState<Record<string, number> | undefined>(undefined);
  // "Hoy" y "Ayer" de los separadores. Se fija al montar: leer el reloj en
  // cada render haría el componente impuro.
  const [hoy] = useState(() => new Date());

  // Filtros (se aplican reiniciando desde la página 0). Con valores por
  // defecto: los filtros guardados en el tablero antes de existir estos dos
  // campos no los traen.
  const { q, desde, hasta, familia, operario = null, soloSeccion = true } = filtros;
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
  // Filtrado = algo DISTINTO de lo de salida. «Solo OT» viene encendido, así
  // que tenerlo puesto no es haber filtrado: si contara, el botón de limpiar
  // estaría siempre encendido y el vacío diría "ningún pedido pasa los filtros"
  // cuando no se ha tocado ninguno.
  const hayFiltros = Boolean(
    q.trim() || desde || hasta || familia || operario ||
      soloSeccion !== FILTROS_HISTORIAL_INICIALES.soloSeccion,
  );

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
        const data = (await r.json()) as { pedidos: HistorialItem[]; hasMore: boolean; familias?: string[]; porDia?: Record<string, number> };
        if (seq !== reqSeq.current) return; // respuesta obsoleta: la ignoramos
        setItems((prev) => (reemplazar ? data.pedidos : [...prev, ...data.pedidos]));
        // Las familias del panel presentes con los demás filtros (las da la
        // lista en memoria). Sin ellas —la consulta de respaldo—, las de siempre.
        if (reemplazar) setFamiliasDisponibles(data.familias ?? null);
        if (reemplazar) setPorDia(data.porDia);
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
  const cabeceraColumnas = (
    <>
      <span /><span>Pedido</span><span>Cliente</span><span>Familia</span><span>Quién</span>
      <span className="text-right">Tiempo {CENTRO_CORTO[seccion]}</span>
      {buscando && <span>Fecha</span>}
    </>
  );
  const dias = buscando ? null : agruparPorDia(itemsVisibles, { hayMas: hasMore, hoy, totales: porDia });
  const fila = (it: HistorialItem) => (
    <FilaHistorial key={`${seccion}:${it.pedido}`} item={it} onOpen={setAbierto} seccion={seccion} columnas={columnas} conFecha={buscando} />
  );

  return (
    <div className="space-y-3">
      {/* ── Filtros ───────────────────────────────────────────────────────
          Una sola fila: buscador, familia, persona, fechas y el interruptor
          de la sección. Se combinan: "de Iván, remolques, la última semana".
          Sueltos sobre el fondo y con el rótulo DELANTE, como la barra de
          Pendientes y Revisiones: era la única pestaña con los filtros metidos
          en una caja y el rótulo encima, y al cambiar de pestaña la barra
          saltaba de forma y de altura. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="relative min-w-56 flex-1 sm:max-w-md">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            id="buscar-historial"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar en el Historial"
            placeholder="Pedido, OF, cliente o descripción…"
            className="glass-chip w-full rounded-lg py-1.5 pl-8 pr-7 text-xs text-text outline-none placeholder:text-text-muted focus:border-brand-400"
          />
          {q && (
            <button type="button" aria-label="Vaciar la búsqueda del Historial" onClick={() => setQ("")}
              className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text">
              ✕
            </button>
          )}
        </div>
        <SeparadorFiltros />
        <div className="flex items-center gap-2">
          <span id="historial-rotulo-familia" className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Familia
          </span>
          <Select
            ariaLabelledBy="historial-rotulo-familia"
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
        </div>
        {/* Por persona: los pedidos en los que imputó tiempo en RPS. */}
        <div className="flex items-center gap-2">
          <span id="historial-rotulo-quien" className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Quién
          </span>
          <Select
            ariaLabelledBy="historial-rotulo-quien"
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
        </div>
        {/* "Pasado a Producción entre…": el MISMO calendario que la barra de
            Pendientes. Eran dos `input[type=date]` y los pintaba el navegador a
            su manera —fondo blanco, su propia tipografía y su «Borrar / Hoy»—
            en medio de una barra que es toda nuestra. */}
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Pasado a Producción
          </span>
          <SelectorFecha
            desde={desde}
            hasta={hasta}
            onCambiar={(d, h) => onFiltros({ desde: d, hasta: h })}
          />
        </div>
        <SeparadorFiltros />
        {/* Un chip que se queda pulsado, como los filtros del tablero: la
            casilla del navegador desentonaba con el resto de la barra. */}
        <button
          type="button"
          onClick={() => setSoloSeccion(!soloSeccion)}
          aria-pressed={soloSeccion}
          title={`Deja fuera los pedidos sin trabajo de ${CENTRO_CORTO[seccion]}`}
          className={`glass-chip rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            soloSeccion
              ? "glass-chip-activo text-brand-800 dark:text-brand-300"
              : "text-text-muted hover:text-text"
          }`}
        >
          Solo {CENTRO_CORTO[seccion]}
        </button>
        {/* Siempre puesto, apagado cuando no hay nada que limpiar. Salía y se
            iba según tocabas los filtros, y la barra entera se encogía y se
            estiraba con cada cambio: los botones de al lado bailaban de sitio
            justo mientras los estabas usando. */}
        <button
          type="button"
          disabled={!hayFiltros}
          onClick={() => onFiltros(FILTROS_HISTORIAL_INICIALES)}
          title={hayFiltros ? "Deja los filtros como estaban" : "No hay filtros que limpiar"}
          className="ml-auto rounded-lg px-2.5 py-1.5 text-xs font-semibold text-text-muted transition-colors enabled:hover:bg-[var(--glass-highlight)] enabled:hover:text-text disabled:opacity-60"
        >
          Limpiar filtros
        </button>
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

      {/* UN BLOQUE POR DÍA, y la fecha fuera de él.

          Antes era una sola caja blanca con los días separados por bandas
          grises por dentro: para saber dónde acababa un día había que leer la
          banda. Ahora cada día es su propia tarjeta con relieve —el mismo
          `bloque-3d` de la ficha— y su fecha va encima, sobre el fondo: el
          corte entre un día y otro se ve sin leer nada.

          Buscando no hay días (los resultados van por fecha del pedido, sin
          separadores), así que ahí todo cae en una sola tarjeta. */}
      {/* gap-5 y no gap-3: la cabecera de cada día es lo que separa un día del
          siguiente, y pegada a la última fila del anterior se leía como una
          fila más. */}
      <div className="flex flex-col gap-5">
        {/* La cabecera de columnas, UNA vez y encima de todo: es el rótulo de
            la lista entera, no de un día. Metida en el primer bloque salía
            debajo de su título y con otra separación. */}
        {itemsVisibles.length > 0 && (
          <div aria-hidden="true" className={`${columnas} px-3 text-[11px] font-semibold text-text-muted`}>
            {cabeceraColumnas}
          </div>
        )}
        {dias
          ? dias.map((dia, i) => (
              <section key={`${dia.clave}-${i}`} aria-label={dia.titulo}>
                <BloqueLista
                  columnas={columnas}
                  sinCaja
                  rotulo={{
                    texto: dia.titulo,
                    sufijo: (
                      <>
                        · {dia.total ?? dia.items.length}
                        {dia.total === null && dia.parcial ? "+" : ""} pedido
                        {(dia.total ?? dia.items.length) === 1 && !dia.parcial ? "" : "s"}
                        {dia.minutos > 0 && !dia.parcial &&
                          ` · ${fmtMin(dia.minutos)} de ${CENTRO_CORTO[seccion]}`}
                      </>
                    ),
                  }}
                >
                  {dia.items.map(fila)}
                </BloqueLista>
              </section>
            ))
          : itemsVisibles.length > 0 && (
              <BloqueLista columnas={columnas} sinCaja>{itemsVisibles.map(fila)}</BloqueLista>
            )}
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
    <FilaDesplegable
      columnas={columnas}
      abierta={desplegado}
      onAlternar={alternar}
      etiqueta={item.pedido}
      idDetalle={`ofs-${seccion}-${item.pedido}`}
      titulo={tituloPasado}
      /* Cada pedido, su propia tarjeta con relieve, y hundida al abrirla —lo
         mismo que Pendientes—. El día sigue teniendo su rótulo encima; lo que
         se va es la caja que envolvía a todas las filas (`sinCaja` arriba),
         que con las filas ya en tarjeta pintaba un fondo de más por detrás. */
      tarjeta
      celdas={
        <>
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
            {negocioAparte(item.cliente, item.negocio) && (
              <span className="text-text-muted"> · {negocioAparte(item.cliente, item.negocio)}</span>
            )}
            {item.estadoActual && (
              <span className="font-semibold text-amber-700 dark:text-amber-300"> · {item.estadoActual}</span>
            )}
          </span>
          <span
            className="pointer-events-none flex min-w-0 items-center gap-1 overflow-hidden"
            title={familias.join(", ")}
          >
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
        </>
      }
      detalle={
        <>
          {cargando && <p className="py-1 text-xs text-text-muted">Cargando OF…</p>}
          {error && <p className="py-1 text-xs text-red-500">No se pudieron cargar las OF.</p>}
          {/* SOLO LAS OF. El desglose de tareas y tiempos NO vive aquí: está
              en la ficha, que es donde hay sitio para leerlo y donde Pendientes
              lo tiene también. Estuvo un tiempo en esta lista —primero como
              ventana, luego como bloque— y ninguna de las dos funcionó: la
              ventana tapaba la lista, y el bloque se desplegaba dentro de la
              columna de 64 px donde vivía su botón. */}
          {ofs && <HistorialOFsCompactas ofs={ofs} seccion={seccion} columnas={columnas} />}
        </>
      }
    />
  );
}
