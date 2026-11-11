"use client";

import { useEffect, useState } from "react";
import type { NotaPedido } from "@/lib/nota-pedido";
import { usePopover } from "@/lib/usePopover";

export function AvisosBelen({ miId, onAbrir }: { miId: string | null; onAbrir: (pedido: string) => void }) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const clave = `coordina.belen.notas-vistas:${miId ?? "local"}`;
  const [notas, setNotas] = useState<NotaPedido[]>([]);
  const [vistos, setVistos] = useState<number[] | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    void Promise.resolve().then(() => {
      if (!vivo) return;
      try {
        const v: unknown = JSON.parse(localStorage.getItem(clave) ?? "[]");
        setVistos(Array.isArray(v) ? v.filter((n): n is number => typeof n === "number") : []);
      } catch { setVistos([]); }
    });
    return () => { vivo = false; };
  }, [clave]);

  useEffect(() => {
    const ctl = new AbortController();
    const pedir = async () => {
      try {
        const r = await fetch("/api/notas-recientes", { cache: "no-store", signal: ctl.signal });
        if (r.status === 401) { window.location.href = "/entrar"; return; }
        if (!r.ok) throw new Error("No se pudieron comprobar las notas");
        const d = await r.json() as { notas: NotaPedido[] };
        if (!ctl.signal.aborted) { setNotas(d.notas); setEstado("listo"); }
      } catch { if (!ctl.signal.aborted) setEstado("error"); }
    };
    void pedir();
    const id = setInterval(() => void pedir(), 30_000);
    return () => { ctl.abort(); clearInterval(id); };
  }, [intento]);

  const pendientes = vistos === null ? [] : notas.filter((n) => n.publica && n.operarioId !== miId && !vistos.includes(n.id));
  const ver = (nota: NotaPedido) => {
    // Solo se marca la nota pulsada; otra del mismo pedido sigue pendiente.
    const nuevos = [...new Set([...(vistos ?? []), nota.id])].filter((id) => notas.some((n) => n.id === id));
    setVistos(nuevos);
    try { localStorage.setItem(clave, JSON.stringify(nuevos)); } catch { /* La lectura funciona también sin almacenamiento. */ }
    setOpen(false);
    onAbrir(nota.pedido);
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={pendientes.length ? `Notificaciones: ${pendientes.length} notas nuevas` : "Notificaciones"} aria-expanded={open} aria-controls="avisos-belen" title="Notificaciones de pedidos" onClick={() => setOpen(!open)} className="glass-chip relative grid size-9 place-items-center rounded-full text-text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {pendientes.length > 0 && <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-red-600 text-[9px] font-bold text-white">{pendientes.length}</span>}
      </button>
      {open && <section id="avisos-belen" aria-label="Notificaciones de pedidos" className="glass-pop absolute right-0 top-full z-40 mt-2 flex max-h-[min(30rem,calc(100dvh-5rem))] w-[22rem] max-w-[calc(100vw-2rem)] flex-col p-4">
        <div className="mb-2 flex shrink-0 items-center justify-between gap-3 border-b border-border pb-3">
          <h2 className="text-sm font-semibold">Notificaciones</h2>
          {pendientes.length > 0 && <span className="rounded-full bg-[var(--hero-relleno)] px-2 py-0.5 text-xs font-semibold tabular-nums text-text-muted">{pendientes.length} {pendientes.length === 1 ? "nueva" : "nuevas"}</span>}
        </div>
        {estado === "cargando" && <p role="status" className="py-3 text-sm text-text-muted">Comprobando notas…</p>}
        {estado === "error" && <p role="alert" className="py-2 text-sm text-text-muted">No se pudieron comprobar las notas. <button type="button" onClick={() => setIntento((n) => n + 1)} className="underline">Reintentar</button></p>}
        {estado === "listo" && vistos !== null && pendientes.length === 0 && <p className="py-3 text-sm text-text-muted">Sin notas nuevas en pedidos.</p>}
        <ul className="scroll-thin min-h-0 space-y-1 overflow-y-auto">{pendientes.map((n) => <li key={n.id}>
          <button type="button" onClick={() => ver(n)} className="belen-notificacion block w-full px-3 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus">
            <span className="flex items-center justify-between gap-2 text-[11px] text-text-muted">
              <span className="inline-flex items-center gap-1.5 font-medium"><span aria-hidden className="size-1.5 rounded-full bg-brand-400" />Nota nueva</span>
              <time dateTime={n.creadoAt}>{new Date(n.creadoAt).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
            </span>
            <span className="mt-1 block text-sm font-semibold text-text">{n.pedido}</span>
            <span className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-text-muted">{n.texto}</span>
            {n.autor && <span className="mt-2 block text-xs text-text-muted">{n.autor}</span>}
          </button>
        </li>)}</ul>
      </section>}
    </div>
  );
}
