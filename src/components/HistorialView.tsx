"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HistorialItem, HistorialOF } from "@/lib/historial";
import { FAMILIA_KEYWORDS } from "@/lib/historial";
import { familiaMeta } from "@/lib/familia";
import { fmtMin } from "@/lib/estado";
import { HistorialDrawer } from "./HistorialDrawer";
import { RolChip } from "./RolChip";

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

/** Historial permanente de pedidos finalizados por OT (datos de RPS, paginado). */
export function HistorialView() {
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
        {Object.keys(FAMILIA_KEYWORDS).map((fam) => {
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

      <div className="space-y-2">
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

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          onClick={alternar}
          aria-expanded={desplegado}
          aria-label={desplegado ? `Ocultar OFs de ${item.pedido}` : `Ver OFs de ${item.pedido}`}
          className="grid size-6 shrink-0 place-items-center rounded text-text-muted hover:bg-surface-2 hover:text-text"
        >
          <span className={`transition-transform ${desplegado ? "rotate-90" : ""}`}>›</span>
        </button>
        <button
          onClick={() => onOpen(item.pedido)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-0.5 text-left hover:bg-surface-2/60"
        >
          <span className="size-2.5 shrink-0 rounded-full bg-cyan-600" />
          <span className="font-semibold text-text">{item.pedido}</span>
          <span className="truncate text-sm text-text-muted">{item.cliente ?? "—"}</span>
          <span className="ml-auto flex shrink-0 items-center gap-3 text-xs text-text-muted">
            <span>{item.nOf} OF</span>
            {/* Quién lo pasó junto a la fecha: en un historial la pregunta
                casi siempre es "¿cuándo y quién?", no una de las dos sola. */}
            <span title={`${origen}: ${pasado.completa}`}>
              Pasado {pasado.corta}
              {item.pasadoPor ? (
                <span className="ml-1 text-text">· {item.pasadoPor}</span>
              ) : (
                <span className="ml-1 italic">· sin autor</span>
              )}
            </span>
          </span>
        </button>
      </div>

      {desplegado && (
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
      )}
    </div>
  );
}
