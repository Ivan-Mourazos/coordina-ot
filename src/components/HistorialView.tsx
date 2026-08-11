"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HistorialItem, HistorialOF } from "@/lib/historial";
import type { Pedido } from "@/lib/types";
import { FAMILIAS_FILTRABLES } from "@/lib/historial";
import { familiaMeta } from "@/lib/familia";
import { fmtMin } from "@/lib/estado";
import { FamiliaTag } from "./FamiliaTag";
import { HistorialDrawer } from "./HistorialDrawer";
import { RolChip } from "./RolChip";
import { Desplegable } from "./Desplegable";

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

/** La página del historial NO trae hoy ni familia ni negocio: `filaAItem`
 *  (lib/historial.ts) mapea solo pedido, cliente, finalizada y nOf, y esos dos
 *  datos viven en la cabecera del detalle, una consulta aparte por pedido.
 *
 *  Se leen con un ensanchado LOCAL del tipo para que la barra los pinte en
 *  cuanto el backend los meta en la fila de la página, sin volver a tocar esta
 *  vista y —sobre todo— sin una petición por fila: son 40 filas por página
 *  contra RPS, cuya vista de pendientes ya tarda de 7 a 15 s ella sola.
 *  Se admiten los dos nombres posibles porque aún no está decidido cuál usará
 *  la query: el detalle ya llama `familias` (en plural) a lo mismo. */
type ItemAmpliado = HistorialItem & {
  familias?: string[];
  familia?: string | null;
  negocio?: string | null;
};

/** Historial permanente de pedidos finalizados por OT (datos de RPS, paginado).
 *
 *  `pasados` son los que pasaste a Producción pero RPS todavía no ha cerrado
 *  (ver el bloque de abajo). Van aparte porque no salen de la misma consulta:
 *  el historial lo pagina RPS y estos viven en el tablero. */
export function HistorialView({
  pasados = [],
  onAbrirPasado,
}: {
  pasados?: readonly Pedido[];
  onAbrirPasado?: (pedidoId: string) => void;
} = {}) {
  const [items, setItems] = useState<HistorialItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);

  // Filtros (se aplican reiniciando desde la página 0).
  const [q, setQ] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [familia, setFamilia] = useState<string | null>(null);
  const [cliente, setCliente] = useState<string | null>(null);

  // Clave de filtros: al cambiar, se reinicia la lista.
  const filtrosKey = `${q}|${desde}|${hasta}|${familia ?? ""}|${cliente ?? ""}`;

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
        if (q.trim()) params.set("q", q.trim());
        if (desde) params.set("desde", desde);
        if (hasta) params.set("hasta", hasta);
        if (familia) params.set("familia", familia);
        if (cliente) params.set("cliente", cliente);
        const r = await fetch(`/api/historial?${params}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as { pedidos: HistorialItem[]; hasMore: boolean };
        if (seq !== reqSeq.current) return; // respuesta obsoleta: la ignoramos
        setItems((prev) => (reemplazar ? data.pedidos : [...prev, ...data.pedidos]));
        setHasMore(data.hasMore);
        setPage(pageAcargar);
      } catch {
        if (seq !== reqSeq.current) return;
        setError(true);
      } finally {
        if (seq === reqSeq.current) setCargando(false);
      }
    },
    [q, desde, hasta, familia, cliente],
  );

  // Al cambiar filtros (o al montar) recarga desde la página 0, con debounce
  // para no lanzar una query pesada por cada tecla del buscador.
  useEffect(() => {
    const t = setTimeout(() => cargar(0, true), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrosKey]);

  // Scroll infinito: un centinela al final dispara la siguiente página.
  const sentinela = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinela.current;
    if (!el || !hasMore || cargando || error) return;
    const io = new IntersectionObserver((entradas) => {
      if (entradas[0].isIntersecting) cargar(page + 1, false);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, cargando, error, page, cargar]);

  return (
    <div className="space-y-3">
      {/* Los que pasaste a Producción y RPS aún no ha cerrado.
          Iban a ninguna parte: la Lista los quita en cuanto se pasan (es la
          lista de lo que QUEDA por hacer) y el Historial no los tiene hasta que
          RPS marca la fase de OT como finalizada, que puede tardar. Entremedias
          el pedido no aparecía por ningún lado — el caso fue AR.26.03948, que
          se pasó y desapareció.
          Arriba y fuera de los filtros de abajo, que son de la consulta a RPS:
          esto es otra cosa y filtrarlo con ellos mentiría. */}
      {pasados.length > 0 && (
        <section className="rounded-xl border border-cyan-500/40 bg-cyan-500/5 p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
            Pasados a Producción ({pasados.length})
          </h2>
          <p className="mt-0.5 text-[11px] text-text-muted">
            Ya no son trabajo de Oficina Técnica. Pasan al historial de abajo en cuanto
            RPS cierre su fase.
          </p>
          <ul className="mt-2 space-y-1">
            {pasados.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => onAbrirPasado?.(p.id)}
                  disabled={!onAbrirPasado}
                  className="flex w-full items-center gap-2 rounded-lg bg-surface/60 px-2 py-1.5 text-left text-xs enabled:hover:bg-surface"
                >
                  <span className="font-mono font-semibold text-text">{p.codigo}</span>
                  <span className="truncate text-text-muted">
                    {p.cliente}
                    {p.negocio ? ` · ${p.negocio}` : ""}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-text-muted">
                    {p.ofs.length} OF
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Filtros propios del historial */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-text-muted">
          Buscar (AR o cliente)
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="AR.26… o cliente"
            className="mt-1 w-56 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text"
          />
        </label>
        <label className="flex flex-col text-xs text-text-muted">
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="mt-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text" />
        </label>
        <label className="flex flex-col text-xs text-text-muted">
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="mt-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text" />
        </label>
        <ClienteAutocomplete value={cliente} onChange={setCliente} />
      </div>

      <div className="flex w-full flex-wrap gap-1.5">
        {/* "Todas" explícito: sin él, volver a ver todo dependía de acordarse
            de repulsar la familia activa, que no se ve por ningún lado. */}
        <button
          onClick={() => setFamilia(null)}
          aria-pressed={familia === null}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${
            familia === null
              ? "bg-text text-surface ring-transparent"
              : "text-text-muted ring-border hover:text-text"
          }`}
        >
          Todas
        </button>
        {FAMILIAS_FILTRABLES.map((fam) => {
          const activa = familia === fam;
          const meta = familiaMeta(fam);
          return (
            <button
              key={fam}
              onClick={() => setFamilia(activa ? null : fam)}
              aria-pressed={activa}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${
                activa ? "text-white ring-transparent" : "text-text-muted ring-border hover:text-text"
              }`}
              style={activa ? { background: meta.color } : undefined}
            >
              {meta.label ?? fam}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-text">
          No se pudo cargar el historial.
          <button onClick={() => cargar(0, true)} className="rounded-lg bg-surface px-2 py-1 text-xs font-semibold ring-1 ring-border hover:bg-surface-2">
            Reintentar
          </button>
        </div>
      )}

      {!error && items.length === 0 && !cargando && (
        <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border text-sm text-text-muted">
          Sin resultados con estos filtros.
        </div>
      )}

      {/* Más juntas: el Historial se lee comparando filas —cuándo se pasó qué y
          quién lo hizo— y con 8 px entre tarjetas caben cinco pedidos menos por
          pantalla sin ganar nada a cambio. La Lista, que es la otra tabla larga
          de la app, no deja aire entre filas. */}
      <div className="space-y-1">
        {items.map((it) => (
          <FilaHistorial key={it.pedido} item={it} onOpen={setAbierto} />
        ))}
      </div>

      {cargando && <p className="py-2 text-center text-xs text-text-muted">Cargando…</p>}
      <div ref={sentinela} className="h-1" />

      <HistorialDrawer pedido={abierto} onClose={() => setAbierto(null)} />
    </div>
  );
}

function ClienteAutocomplete({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (cliente: string | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [sug, setSug] = useState<string[]>([]);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const t = texto.trim();
    // El reset (texto < 2 chars) también se difiere al timer: llamar a
    // setState de forma síncrona en el cuerpo del efecto dispara el lint
    // react-hooks/set-state-in-effect (cascading renders).
    const timer = setTimeout(async () => {
      if (t.length < 2) {
        setSug([]);
        return;
      }
      try {
        const r = await fetch(`/api/historial/clientes?q=${encodeURIComponent(t)}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { clientes: string[] };
        setSug(d.clientes);
        setAbierto(true);
      } catch {
        /* sin sugerencias */
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [texto]);

  if (value) {
    return (
      <label className="flex flex-col text-xs text-text-muted">
        Cliente
        <span className="mt-1 flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text">
          {value}
          <button onClick={() => onChange(null)} aria-label="Quitar cliente" className="ml-1 text-text-muted hover:text-text">
            ✕
          </button>
        </span>
      </label>
    );
  }

  return (
    <label className="relative flex flex-col text-xs text-text-muted">
      Cliente
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onFocus={() => texto.trim().length >= 2 && sug.length > 0 && setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Escribe 2+ letras…"
        className="mt-1 w-56 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text"
      />
      {abierto && sug.length > 0 && (
        <ul className="glass-pop absolute top-full z-30 mt-1 max-h-60 w-72 overflow-y-auto rounded-lg p-1">
          {sug.map((c) => (
            <li key={c}>
              <button
                onMouseDown={() => {
                  onChange(c);
                  setTexto("");
                  setAbierto(false);
                }}
                className="block w-full truncate rounded px-2 py-1 text-left text-sm text-text hover:bg-[var(--glass-highlight)]"
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
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
 *  texto: el verbo dice cuál se está leyendo ("Planteó Ana" / "Lo pasó Ana"),
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
        title={`Quién lo planteó: ${autores.join(", ")}. En los pedidos anteriores a CoordinaOT se deduce del reparto de horas de RPS.`}
      >
        {autores.length > 1 ? "Plantearon" : "Planteó"} {visibles.join(" y ")}
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
  return <span className="italic">sin autor</span>;
}

/** Una fila del historial: la barra entera DESPLIEGA sus OFs, y el detalle
 *  completo se abre con un botón propio.
 *
 *  Antes era al revés —la barra abría el drawer y solo la flecha desplegaba— y
 *  eso choca con la Lista, donde pulsar la fila despliega. Quien venía de la
 *  Lista pulsaba el pedido esperando ver sus OF y le saltaba el drawer encima.
 *  El detalle sigue haciendo falta (ahí van a ir los documentos y las reservas
 *  de material), así que tiene botón propio: rotulado, siempre visible y en el
 *  tabulador. En un hover no se encontraría, y con el teclado no se llegaría. */
function FilaHistorial({ item, onOpen }: { item: HistorialItem; onOpen: (pedido: string) => void }) {
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
      const r = await fetch(`/api/historial/${item.pedido}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { ofs: HistorialOF[] };
      setOfs(d.ofs);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [desplegado, ofs, cargando, item.pedido]);

  // El momento real en que se pasó a Producción es el de CoordinaOT; el de RPS
  // es cuando OLANET registró el cambio y puede ir por detrás.
  const pasado = fmtFecha(item.pasadoAt ?? item.finalizada);
  const origen = item.pasadoAt ? "Marcado en CoordinaOT" : "Según el cambio de estado en RPS";
  // Quién lo pasó viaja en el title de la fecha, que es el sitio que le
  // corresponde: "pasar a Producción" es un acto con su hora, no la autoría.
  const tituloPasado = item.pasadoPor
    ? `${origen}: ${pasado.completa} · lo pasó ${item.pasadoPor}`
    : `${origen}: ${pasado.completa}`;

  const ampliado = item as ItemAmpliado;
  const familias = Array.isArray(ampliado.familias)
    ? ampliado.familias.filter(Boolean)
    : ampliado.familia
      ? [ampliado.familia]
      : [];

  return (
    // `pl-1` reserva SIEMPRE el hueco de la barra de acento: si apareciera solo
    // al abrir, el pedido daría un salto lateral justo cuando lo estás mirando.
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface pl-1">
      {/* Cuál está desplegado: una barra de acento que recorre el bloque entero,
          cabecera y OFs. De las tres marcas posibles es la única que dice DÓNDE
          ACABA lo abierto, que es justo la queja ("parece todo pedidos"): un
          fondo distinto en la cabecera marca el principio y deja el final a
          ojo, y un borde alrededor no se nota porque cada fila ya trae el suyo.
          Color de marca en plano: se ve igual en claro y en oscuro. */}
      {desplegado && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-brand-500" />}

      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={alternar}
          aria-expanded={desplegado}
          aria-label={desplegado ? `Ocultar OFs de ${item.pedido}` : `Ver OFs de ${item.pedido}`}
          className="grid size-6 shrink-0 cursor-pointer place-items-center rounded text-text-muted hover:bg-surface-2 hover:text-text"
        >
          <span className={`transition-transform ${desplegado ? "rotate-90" : ""}`}>›</span>
        </button>
        {/* Sin `aria-label`: todo lo que se lee de la fila (código, cliente,
            OFs, fecha) vive dentro de este botón y es su nombre accesible;
            ponerle una etiqueta lo taparía entero. El estado lo da aria-expanded. */}
        <button
          type="button"
          onClick={alternar}
          aria-expanded={desplegado}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-2 py-0.5 text-left hover:bg-surface-2/60"
        >
          <span className="size-2.5 shrink-0 rounded-full bg-cyan-600" />
          {/* Identidad en dos renglones, como va a quedar la Lista: arriba el
              código con su familia, abajo el cliente. Antes iba todo seguido en
              una línea y el cliente se comía el ancho que necesita el resto. */}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="font-mono font-semibold text-text">{item.pedido}</span>
              {familias.map((f) => (
                <FamiliaTag key={f} familia={f} />
              ))}
            </span>
            <span className="block truncate text-xs text-text-muted">
              {item.cliente ?? "—"}
              {ampliado.negocio && <span> · {ampliado.negocio}</span>}
            </span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-3 text-xs text-text-muted">
            <span>{item.nOf} OF</span>
            <span title={tituloPasado}>Pasado {pasado.corta}</span>
            <Autoria item={item} />
          </span>
        </button>
        {/* El detalle completo, ahora que la barra despliega.
            Rotulado SOLO al pasar por encima: repetido en las 40 filas de la
            página, "Ver detalle" formaba una columna de texto que pesaba más
            que los datos del pedido. El icono se queda siempre (para saber que
            se puede) y la palabra aparece cuando hace falta, que es cuando se
            está a punto de pulsarlo. Con teclado sale igual, por `focus`. */}
        <button
          type="button"
          onClick={() => onOpen(item.pedido)}
          aria-label={`Ver detalle de ${item.pedido}`}
          title="Ficha del pedido: escaneo, fechas, comentario de ventas y sus OF"
          className="group/detalle flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold text-text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:bg-surface-2 focus-visible:text-text"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span className="hidden group-hover/detalle:inline group-focus-visible/detalle:inline">
            Ver detalle
          </span>
        </button>
      </div>

      {/* Envuelto y no `{desplegado && …}`: si React lo quitara al pulsar, el
          contenido desaparecería de golpe y no habría nada que animar. Cerrado
          no ocupa nada (`Desplegable` devuelve null). */}
      <Desplegable abierto={desplegado}>
        <div className="border-t border-border px-4 py-2">
          {cargando && <p className="py-1 text-xs text-text-muted">Cargando OFs…</p>}
          {error && <p className="py-1 text-xs text-red-500">No se pudieron cargar las OFs.</p>}
          {ofs?.length === 0 && <p className="py-1 text-xs text-text-muted">Sin OFs.</p>}
          <ul className="space-y-1.5">
            {ofs?.map((of) => (
              <li key={of.codigo} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="font-mono font-semibold text-text">{of.codigo}</span>
                <span className="min-w-0 flex-1 truncate text-text-muted">{of.descripcion}</span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-text ring-1 ring-border">
                  {fmtMin(of.tiempoImputadoMin)}
                </span>
                {of.rol && (
                  <span className="flex gap-1.5">
                    <RolChip rol="plantear" min={of.rol.planteoMin} quien={of.rol.quienPlanteo} />
                    <RolChip rol="revisar" min={of.rol.revisionMin} quien={of.rol.quienReviso} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Desplegable>
    </div>
  );
}
