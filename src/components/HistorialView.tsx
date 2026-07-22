"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HistorialItem, HistorialOF } from "@/lib/historial";
import { fmtMin } from "@/lib/estado";

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

  // Filtros (se aplican reiniciando desde la página 0).
  const [q, setQ] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  // Clave de filtros: al cambiar, se reinicia la lista.
  const filtrosKey = `${q}|${desde}|${hasta}`;

  const cargar = useCallback(
    async (pageAcargar: number, reemplazar: boolean) => {
      setCargando(true);
      setError(false);
      try {
        const params = new URLSearchParams({ page: String(pageAcargar) });
        if (q.trim()) params.set("q", q.trim());
        if (desde) params.set("desde", desde);
        if (hasta) params.set("hasta", hasta);
        const r = await fetch(`/api/historial?${params}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as { pedidos: HistorialItem[]; hasMore: boolean };
        setItems((prev) => (reemplazar ? data.pedidos : [...prev, ...data.pedidos]));
        setHasMore(data.hasMore);
        setPage(pageAcargar);
      } catch {
        setError(true);
      } finally {
        setCargando(false);
      }
    },
    [q, desde, hasta],
  );

  // Al cambiar filtros (o al montar), recarga desde la página 0. La llamada
  // se difiere a un microtask (.then) para que el setState quede dentro de un
  // callback y no directamente en el cuerpo síncrono del efecto (mismo patrón
  // que el resto del repo, p.ej. la carga de fichaje en Board.tsx).
  useEffect(() => {
    void Promise.resolve().then(() => cargar(0, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrosKey]);

  // Scroll infinito: un centinela al final dispara la siguiente página.
  const sentinela = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinela.current;
    if (!el || !hasMore || cargando) return;
    const io = new IntersectionObserver((entradas) => {
      if (entradas[0].isIntersecting) cargar(page + 1, false);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, cargando, page, cargar]);

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
          <FilaHistorial key={it.pedido} item={it} />
        ))}
      </div>

      {cargando && <p className="py-2 text-center text-xs text-text-muted">Cargando…</p>}
      <div ref={sentinela} className="h-1" />
    </div>
  );
}

function FilaHistorial({ item }: { item: HistorialItem }) {
  const [abierto, setAbierto] = useState(false);
  const [ofs, setOfs] = useState<HistorialOF[] | null>(null);
  const [cargandoDet, setCargandoDet] = useState(false);

  const toggle = useCallback(async () => {
    const nuevo = !abierto;
    setAbierto(nuevo);
    if (nuevo && ofs === null && !cargandoDet) {
      setCargandoDet(true);
      try {
        const r = await fetch(`/api/historial/${item.pedido}`, { cache: "no-store" });
        const data = (await r.json()) as { ofs: HistorialOF[] };
        setOfs(r.ok ? data.ofs : []);
      } catch {
        setOfs([]);
      } finally {
        setCargandoDet(false);
      }
    }
  }, [abierto, ofs, cargandoDet, item.pedido]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <button
        onClick={toggle}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2/60"
      >
        <svg viewBox="0 0 24 24" className={`size-3.5 shrink-0 text-text-muted transition-transform ${abierto ? "rotate-90" : ""}`}
          fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="size-2.5 shrink-0 rounded-full bg-cyan-600" />
        <span className="font-semibold text-text">{item.pedido}</span>
        <span className="truncate text-sm text-text-muted">{item.cliente ?? "—"}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3 text-xs text-text-muted">
          <span>{item.nOf} OF</span>
          <span>Finalizado {fmtFecha(item.finalizada)}</span>
        </span>
      </button>

      {abierto && (
        <div className="border-t border-border">
          {cargandoDet && <p className="px-4 py-3 text-xs text-text-muted">Cargando detalle…</p>}
          {ofs && ofs.length === 0 && !cargandoDet && (
            <p className="px-4 py-3 text-xs text-text-muted">Sin imputaciones de OT registradas.</p>
          )}
          {ofs && ofs.length > 0 && (
            <ul className="divide-y divide-border">
              {ofs.map((of) => (
                <li key={of.codigo} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span className="font-mono text-xs font-semibold text-text">{of.codigo}</span>
                  <span className="text-sm text-text">{of.descripcion}</span>
                  <span className="ml-auto text-[11px] text-text-muted">
                    {of.quien.length > 0 ? of.quien.join(", ") : "—"}
                  </span>
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-text ring-1 ring-border">
                    {fmtMin(of.tiempoImputadoMin)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
