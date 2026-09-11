"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HistorialItem, HistorialOF } from "@/lib/historial";
import type { Operario } from "@/lib/types";
import { FAMILIAS_FILTRABLES } from "@/lib/historial";
import { familiaMeta } from "@/lib/familia";
import { FamiliaTag } from "./FamiliaTag";
import { HistorialDrawer } from "./HistorialDrawer";
import { HistorialOFsCompactas } from "./HistorialOFsCompactas";
import { HistorialTareas } from "./HistorialTareas";
import { Desplegable } from "./Desplegable";
import { Select } from "./Select";
import { PedidoCodigo } from "./PedidoCodigo";
import { SECCIONES, SECCION_POR_DEFECTO, type SeccionId } from "@/lib/secciones";
import { fmtMin } from "@/lib/estado";

/** Fecha en la que se pasó. Sin hora: en una lista de pedidos ya cerrados
 *  nadie consulta si fueron las 09:14 o las 09:15, y la hora ocupaba tanto
 *  como el resto de la línea. El momento exacto sigue en el `title`.
 *
 *  Siempre con año (dos cifras): en una lista que baja hasta pedidos de 2024,
 *  "11/09" sin año obligaba a adivinar de cuál se hablaba. */
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
export type FiltrosHistorial = { q: string; desde: string; hasta: string; familia: string | null };
export const FILTROS_HISTORIAL_INICIALES: FiltrosHistorial = { q: "", desde: "", hasta: "", familia: null };

export function HistorialView({
  operarios = [],
  miId = null,
  seccion = SECCION_POR_DEFECTO,
  filtros,
  onFiltros,
}: {
  /** Solo para el hilo de notas del drawer: sin ellos las notas saldrían con el
   *  id crudo ("jaime") en vez del nombre y su color. */
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

  // Filtros (se aplican reiniciando desde la página 0).
  const { q, desde, hasta, familia } = filtros;
  const setQ = (q: string) => onFiltros({ q });
  const setDesde = (desde: string) => onFiltros({ desde });
  const setHasta = (hasta: string) => onFiltros({ hasta });
  const setFamilia = (familia: string | null) => onFiltros({ familia });

  // Clave de filtros: al cambiar, se reinicia la lista.
  const filtrosKey = `${seccion}|${q}|${desde}|${hasta}|${familia ?? ""}`;
  const resultadosVigentes = claveResultado === filtrosKey;
  const itemsVisibles = resultadosVigentes ? items : [];
  const hayFiltros = Boolean(q.trim() || desde || hasta || familia);

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
        const r = await fetch(`/api/historial?${params}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as { pedidos: HistorialItem[]; hasMore: boolean };
        if (seq !== reqSeq.current) return; // respuesta obsoleta: la ignoramos
        setItems((prev) => (reemplazar ? data.pedidos : [...prev, ...data.pedidos]));
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
    [seccion, q, desde, hasta, familia, filtrosKey],
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

  return (
    <div className="space-y-3">
      {/* ── Filtros ───────────────────────────────────────────────────────
          Estaban a medio hacer y desalineados con el resto de la app: los
          rótulos hablaban solo de pedidos "AR" (existen también SA y BE, ver
          `esCodigoPedido`), la familia se elegía en una fila de catorce chips
          que ocupaba dos alturas, y no había forma de saber qué había puesto ni
          de quitarlo todo de una vez — cosa que las otras dos vistas sí tienen.
          Ahora la barra es una sola fila con los mismos controles que Pendientes
          y Revisiones, y dice lo que está recortando. */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
        <div className="flex min-w-60 flex-1 flex-col text-xs text-text-muted">
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
              options={FAMILIAS_FILTRABLES.map((fam) => {
                const meta = familiaMeta(fam);
                return {
                  value: fam,
                  label: meta.label ?? fam,
                  icon: (
                    <span
                      className="size-2.5 rounded-full"
                      style={{ background: meta.color }}
                      aria-hidden="true"
                    />
                  ),
                };
              })}
            />
          </span>
        </label>
        {/* "Pasado a Producción entre…": las dos fechas van juntas y rotuladas
            como lo que miden. Sueltas, "Desde" y "Hasta" no decían de qué
            fecha hablaban — el historial tiene la de pasar y la de entrega. */}
        <div className="flex flex-col text-xs text-text-muted">
          Pasado a Producción
          <span className="mt-1 flex items-center gap-1.5">
            <input
              type="date"
              value={desde}
              aria-label="Pasado a Producción desde"
              max={hasta || undefined}
              onChange={(e) => setDesde(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text"
            />
            <span className="text-text-muted">a</span>
            <input
              type="date"
              value={hasta}
              aria-label="Pasado a Producción hasta"
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text"
            />
          </span>
        </div>
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
                ? "Prueba con otro texto o amplía el periodo."
                : `Aquí aparecen los pedidos terminados en ${SECCIONES[seccion].nombre}; si no tienen tareas de esta sección, cuando termina el resto de su trabajo.`}
            </p>
          </div>
        </div>
      )}

      {/* Cuántos se están viendo. Con scroll infinito y filtros puestos, sin
          este número no había forma de saber si la búsqueda había encontrado
          tres pedidos o trescientos. */}
      {!error && itemsVisibles.length > 0 && (
        <p className="text-[11px] text-text-muted">
          {itemsVisibles.length} pedido{itemsVisibles.length === 1 ? "" : "s"}
          {hasMore ? " y subiendo — baja para cargar más" : ""}
          {q.trim() ? " · Fecha del pedido: más recientes primero" : ""}
        </p>
      )}

      {/* Filas continuas, con identidad, autoría y fecha en posiciones estables. */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {itemsVisibles.length > 0 && (
          <div aria-hidden="true" className={`${COLUMNAS} border-b border-border bg-surface-2 px-3 py-2 text-[11px] font-semibold text-text-muted`}>
            <span /><span>Pedido · cliente</span><span>Autoría · revisión</span>
            <span className="text-right">Tiempo {CENTRO_CORTO[seccion]}</span><span>Pasado</span>
          </div>
        )}
        {itemsVisibles.map((it) => (
          <FilaHistorial key={`${seccion}:${it.pedido}`} item={it} onOpen={setAbierto} seccion={seccion} />
        ))}
      </div>

      {(cargando || !resultadosVigentes) && <p role="status" className="py-2 text-center text-xs text-text-muted">{q.trim() ? "Buscando en todo el historial…" : "Cargando…"}</p>}
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

/** Quién hay detrás del pedido, en el hueco donde antes ponía "· sin autor".
 *
 *  Ese literal salía en cuanto faltaba `pasadoPor` —o sea, en todo lo anterior
 *  a la web— y era mentira: al desplegar la fila aparecen los técnicos con sus
 *  horas. Ahora manda `autores` (quien lo planteó, registrado en los pedidos
 *  nuevos y deducido del reparto de horas de RPS en los viejos).
 *
 *  `autores` y `pasadoPor` son cosas distintas y NO se juntan en un mismo
 *  texto: el verbo dice cuál se está leyendo ("Autor: Ana" / "Lo pasó Ana"),
 *  y el title lo remata. Cuando hay autores, quien lo pasó no desaparece: está
 *  en el title de la fecha, al lado. Dos nombres es un resultado válido —se lo
 *  repartieron a partes iguales—, así que se enseñan los dos. */
function Autoria({ item }: { item: HistorialItem }) {
  const autores = (item.autores ?? []).filter(Boolean);
  const revisores = (item.revisores ?? []).filter((n) => n && !autores.includes(n));
  const otros = item.otrosCentros ?? [];
  // El pedido no tiene tareas de la sección: lo que se enseña es trabajo de
  // otro centro, y tiene que decirlo. Sin esto, la lista de OT ponía a gente
  // de Taller como autora sin más.
  const centro = otros.length > 0 && (
    <span
      className="mr-1.5 shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-text-muted ring-1 ring-border"
      title="Este pedido no tiene tareas de la sección: la autoría y el tiempo son de este centro."
    >
      Solo {otros.map((c) => CENTRO_CORTO[c]).join(" y ")}
    </span>
  );
  if (autores.length > 0) {
    const visibles = autores.slice(0, 2);
    return (
      <span
        className="flex min-w-0 items-center"
        title={`Autoría: ${autores.join(", ")}${revisores.length ? ` · Revisión: ${revisores.join(", ")}` : ""}. En los pedidos anteriores a CoordinaOT se deduce del reparto de horas de RPS.`}
      >
        {centro}
        {/* Sin "Autor:" delante: lo dice la cabecera de la columna, y en cada
            fila era la misma palabra repetida cuarenta veces. */}
        <span className="truncate">
          <span className="text-text">
            {visibles.join(" y ")}
            {autores.length > 2 && ` +${autores.length - 2}`}
          </span>
          {revisores.length > 0 && (
            <span> · revisó {revisores[0]}{revisores.length > 1 && ` +${revisores.length - 1}`}</span>
          )}
        </span>
      </span>
    );
  }
  if (item.pasadoPor) {
    return (
      <span
        className="flex min-w-0 items-center"
        title={`${item.pasadoPor} pulsó "pasar a Producción". De este pedido no consta quién lo planteó, y no tienen por qué ser la misma persona.`}
      >
        {centro}
        <span className="truncate text-text">Lo pasó {item.pasadoPor}</span>
      </span>
    );
  }
  // Ahora sí: ni autores ni quien lo pasó. Ningún minuto imputado a nadie.
  return (
    <span className="flex min-w-0 items-center">
      {centro}
      <span className="italic">Sin autor registrado</span>
    </span>
  );
}

/** Nombre corto de cada centro, para la cabecera y la etiqueta "Solo …". */
const CENTRO_CORTO = { ot: "OT", diseno: "Diseño", taller: "Taller" } as const;

/** Las mismas columnas en la cabecera y en cada fila. */
const COLUMNAS = "grid grid-cols-[32px_minmax(0,1fr)_minmax(200px,26%)_72px_76px] items-center gap-x-3";

/** El nombre abre la ficha; la flecha izquierda despliega las OF compactas. */
function FilaHistorial({ item, onOpen, seccion }: { item: HistorialItem; onOpen: (pedido: string) => void; seccion: SeccionId }) {
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
  // Quién lo pasó viaja en el title de la fecha, que es el sitio que le
  // corresponde: "pasar a Producción" es un acto con su hora, no la autoría.
  const tituloPasado = item.pasadoPor
    ? `${origen}: ${pasado.completa} · lo pasó ${item.pasadoPor}`
    : `${origen}: ${pasado.completa}`;

  const familias = item.familias ?? [];

  return (
    <div className="relative border-b border-border last:border-b-0">
      {desplegado && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-brand-500" />}
      <div className={`relative ${COLUMNAS} px-3 py-1.5 ${desplegado ? "bg-brand-500/10" : "hover:bg-surface-2"}`}>
        {/* Fondo y nombre son botones hermanos: un clic produce una sola acción. */}
        <button
          type="button"
          onClick={alternar}
          aria-expanded={desplegado}
          aria-controls={`ofs-${seccion}-${item.pedido}`}
          aria-label={`${desplegado ? "Plegar" : "Desplegar"} ${item.pedido}`}
          title={`${tituloPasado}${item.autores?.length ? ` · Autoría: ${item.autores.join(", ")}` : ""}`}
          className="absolute inset-0 cursor-pointer rounded-sm focus-visible:z-10"
        />
        <span aria-hidden="true" className="pointer-events-none grid size-7 place-items-center text-text-muted">
          <svg viewBox="0 0 24 24" className={`size-3.5 transition-transform motion-reduce:transition-none ${desplegado ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        {/* Una sola línea: código, OF, familias y cliente. El cliente es lo
            que cede si no cabe (se corta con "…" y entero en el title). */}
        <div className="pointer-events-none flex min-w-0 items-center gap-2 text-[11px]">
          <PedidoCodigo codigo={item.pedido} onAbrir={() => onOpen(item.pedido)} />
          <span className="shrink-0 font-medium text-text-muted" title={`${item.nOf} ${item.nOf === 1 ? "orden" : "órdenes"} de fabricación en todo el pedido`}>· {item.nOf} OF</span>
          {familias.length > 0 && (
            <span className="flex shrink-0 gap-1">{familias.map((f) => <FamiliaTag key={f} familia={f} />)}</span>
          )}
          <span className="min-w-0 truncate text-text" title={[item.cliente, item.negocio].filter(Boolean).join(" · ")}>
            {item.cliente ?? "—"}
            {item.negocio && <span className="text-text-muted"> · {item.negocio}</span>}
          </span>
        </div>
        <div className="pointer-events-none min-w-0 text-[11px] leading-4 text-text-muted">
          <Autoria item={item} />
        </div>
        <div
          className="pointer-events-none text-right font-mono text-[11px] tabular-nums text-text"
          title={item.minutos === undefined
            ? "No se pudo leer el tiempo imputado"
            : `Tiempo imputado en RPS a las tareas de ${item.otrosCentros?.length ? item.otrosCentros.map((c) => CENTRO_CORTO[c]).join(" y ") : CENTRO_CORTO[seccion]}`}
        >
          {item.minutos === undefined ? "—" : fmtMin(item.minutos)}
        </div>
        <div className="pointer-events-none text-[11px] leading-4 text-text-muted">
          {item.estadoActual
            ? <span className="font-semibold text-amber-700 dark:text-amber-300">{item.estadoActual}</span>
            : <span title={tituloPasado}>{item.pasadoAt || item.finalizada ? pasado.corta : "Sin fecha"}</span>}
          {item.busqueda && item.fechaPedido && <span className="block" title="Fecha del pedido en RPS; orden de los resultados de búsqueda">Pedido {fmtFecha(item.fechaPedido).corta}</span>}
        </div>
      </div>

      {/* Envuelto y no `{desplegado && …}`: si React lo quitara al pulsar, el
          contenido desaparecería de golpe y no habría nada que animar. Cerrado
          no ocupa nada (`Desplegable` devuelve null). */}
      <div id={`ofs-${seccion}-${item.pedido}`}>
      <Desplegable abierto={desplegado}>
        <div className="border-t border-border px-4 py-2">
          {cargando && <p className="py-1 text-xs text-text-muted">Cargando OF…</p>}
          {error && <p className="py-1 text-xs text-red-500">No se pudieron cargar las OF.</p>}
          {ofs && <><HistorialTareas ofs={ofs} seccion={seccion} /><HistorialOFsCompactas ofs={ofs} seccion={seccion} /></>}
        </div>
      </Desplegable>
      </div>
    </div>
  );
}
