"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HistorialItem } from "@/lib/historial";
import { FAMILIA_KEYWORDS } from "@/lib/historial";
import { familiaMeta } from "@/lib/familia";
import { HistorialDrawer } from "./HistorialDrawer";

function fmtFecha(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
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
        {Object.keys(FAMILIA_KEYWORDS).map((fam) => {
          const activa = familia === fam;
          const meta = familiaMeta(fam);
          return (
            <button
              key={fam}
              onClick={() => setFamilia(activa ? null : fam)}
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
        onFocus={() => sug.length > 0 && setAbierto(true)}
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
  return (
    <button
      onClick={() => onOpen(item.pedido)}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-left hover:bg-surface-2/60"
    >
      <span className="size-2.5 shrink-0 rounded-full bg-cyan-600" />
      <span className="font-semibold text-text">{item.pedido}</span>
      <span className="truncate text-sm text-text-muted">{item.cliente ?? "—"}</span>
      <span className="ml-auto flex shrink-0 items-center gap-3 text-xs text-text-muted">
        <span>{item.nOf} OF</span>
        <span>Finalizado {fmtFecha(item.finalizada)}</span>
      </span>
    </button>
  );
}
