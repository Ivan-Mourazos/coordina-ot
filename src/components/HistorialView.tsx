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

/** Fecha en la que se pasó. Sin hora: en una lista de pedidos ya cerrados
 *  nadie consulta si fueron las 09:14 o las 09:15, y la hora ocupaba tanto
 *  como el resto de la línea. El momento exacto sigue en el `title`. */
function fmtFecha(iso: string): { corta: string; completa: string } {
  if (!iso) return { corta: "—", completa: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { corta: "—", completa: "" };
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  const corta = ano === new Date().getFullYear() ? `${dd}/${mm}` : `${dd}/${mm}/${ano}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return { corta, completa: `${dd}/${mm}/${ano} a las ${hh}:${mi}` };
}

/** La API incorpora los pasos locales antes del cierre en RPS y antes de paginar. */
export function HistorialView({
  operarios = [],
  miId = null,
  seccion = SECCION_POR_DEFECTO,
}: {
  /** Solo para el hilo de notas del drawer: sin ellos las notas saldrían con el
   *  id crudo ("jaime") en vez del nombre y su color. */
  operarios?: readonly Operario[];
  /** Quién soy: finalizar una fase en RPS se firma con mi código de operario. */
  miId?: string | null;
  seccion?: SeccionId;
} = {}) {
  const [items, setItems] = useState<HistorialItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [claveResultado, setClaveResultado] = useState<string | null>(null);

  // Filtros (se aplican reiniciando desde la página 0).
  const [q, setQ] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [familia, setFamilia] = useState<string | null>(null);

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
        <label className="flex min-w-60 flex-1 flex-col text-xs text-text-muted">
          Buscar en el Historial
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pedido, OF, cliente o descripción…"
            className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text"
          />
        </label>
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
              setQ("");
              setDesde("");
              setHasta("");
              setFamilia(null);
            }}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text-muted hover:border-border-strong hover:text-text"
          >
            Limpiar
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
        {itemsVisibles.length > 0 && <div aria-hidden="true" className="hidden grid-cols-[32px_minmax(0,1fr)_minmax(180px,28%)_minmax(140px,18%)] gap-3 border-b border-border bg-surface-2 px-3 py-3 text-[11px] font-semibold text-text-muted md:grid"><span /><span>Pedido · cliente</span><span>Autoría</span><span>Finalizado</span></div>}
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
  if (autores.length > 0) {
    const visibles = autores.slice(0, 2);
    return (
      <span
        className="text-text"
        title={`Autoría de las tareas: ${autores.join(", ")}. En los pedidos anteriores a CoordinaOT se deduce del reparto de horas de RPS.`}
      >
        {autores.length > 1 ? "Autores:" : "Autor:"} {visibles.join(" y ")}
        {autores.length > 2 && ` +${autores.length - 2}`}
      </span>
    );
  }
  if (item.pasadoPor) {
    return (
      <span
        className="text-text"
        title={`${item.pasadoPor} pulsó "pasar a Producción". De este pedido no consta quién lo planteó, y no tienen por qué ser la misma persona.`}
      >
        Lo pasó {item.pasadoPor}
      </span>
    );
  }
  // Ahora sí: ni autores ni quien lo pasó. Ningún minuto imputado a nadie.
  return <span className="italic">Sin autor registrado</span>;
}

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
      <div className={`relative grid grid-cols-[32px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-3 py-2 md:grid-cols-[32px_minmax(0,1fr)_minmax(180px,28%)_minmax(140px,18%)] ${desplegado ? "bg-brand-500/10" : "hover:bg-surface-2"}`}>
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
        <span aria-hidden="true" className="pointer-events-none grid size-8 place-items-center text-text-muted">
          <svg viewBox="0 0 24 24" className={`size-3.5 transition-transform motion-reduce:transition-none ${desplegado ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <div className="pointer-events-none min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <PedidoCodigo codigo={item.pedido} onAbrir={() => onOpen(item.pedido)} />
            <span className="text-[11px] font-medium text-text-muted" title={`${item.nOf} ${item.nOf === 1 ? "orden" : "órdenes"} de fabricación en todo el pedido`}>· {item.nOf} OF</span>
            {familias.map((f) => <FamiliaTag key={f} familia={f} />)}
          </div>
          <p className="text-[11px] leading-4 text-text [overflow-wrap:anywhere]">
            {item.cliente ?? "—"}
            {item.negocio && <span className="text-text-muted"> · {item.negocio}</span>}
          </p>
        </div>
        <div className="pointer-events-none col-start-2 min-w-0 text-[11px] leading-4 text-text-muted [overflow-wrap:anywhere] md:col-start-auto">
          <Autoria item={item} />
        </div>
        <div className="pointer-events-none col-start-2 flex flex-wrap gap-x-2 text-[11px] leading-4 text-text-muted md:col-start-auto md:flex-col md:items-start">
          {item.estadoActual
            ? <span className="font-semibold text-amber-700 dark:text-amber-300">{item.estadoActual}</span>
            : <span title={tituloPasado}>{item.pasadoAt || item.finalizada ? `Pasado ${pasado.corta}` : "Finalizado · sin fecha registrada"}</span>}
          {item.busqueda && item.fechaPedido && <span title="Fecha del pedido en RPS; orden de los resultados de búsqueda">Pedido {fmtFecha(item.fechaPedido).corta}</span>}
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
