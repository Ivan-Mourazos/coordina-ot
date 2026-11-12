"use client";

import { useEffect, useState } from "react";
import { avisosPendientes, leerMarca, marcarVistas, type AvisoPedido, type MarcaAvisos } from "@/lib/avisos-belen";
import type { NotaPedido } from "@/lib/nota-pedido";
import { usePopover } from "@/lib/usePopover";

export function AvisosBelen({ miId, onAbrir }: { miId: string | null; onAbrir: (pedido: string) => void }) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  // Clave nueva a propósito: la vieja era la lista de ids vistos, y con ella
  // seguían saliendo todas las de antes (lib/avisos-belen.ts).
  const clave = `coordina.belen.avisos-notas:${miId ?? "local"}`;
  const [notas, setNotas] = useState<NotaPedido[]>([]);
  const [marca, setMarca] = useState<MarcaAvisos | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    void Promise.resolve().then(() => {
      if (!vivo) return;
      let guardado: string | null = null;
      try { guardado = localStorage.getItem(clave); } catch { /* Sin almacenamiento: empieza ahora. */ }
      const m = leerMarca(guardado, new Date().toISOString());
      setMarca(m);
      if (!guardado) {
        try {
          localStorage.setItem(clave, JSON.stringify(m));
          localStorage.removeItem(`coordina.belen.notas-vistas:${miId ?? "local"}`);
        } catch { /* Funciona también sin almacenamiento. */ }
      }
    });
    return () => { vivo = false; };
  }, [clave, miId]);

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

  function guardar(m: MarcaAvisos) {
    try { localStorage.setItem(clave, JSON.stringify(m)); } catch { /* Funciona también sin almacenamiento. */ }
  }
  const avisos = marca === null ? [] : avisosPendientes(notas, marca, miId);
  const cuantas = avisos.reduce((n, a) => n + a.notas.length, 0);
  // Al abrir el pedido se dan por vistas todas sus notas: se leen juntas en
  // la pestaña Notas.
  const ver = (aviso: AvisoPedido) => {
    if (marca) {
      const m = marcarVistas(marca, aviso.notas.map((n) => n.id), notas);
      setMarca(m);
      guardar(m);
    }
    setOpen(false);
    onAbrir(aviso.pedido);
  };
  const marcarTodo = () => {
    const m: MarcaAvisos = { desde: new Date().toISOString(), vistas: [] };
    setMarca(m);
    guardar(m);
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={cuantas ? `Notificaciones: ${cuantas} ${cuantas === 1 ? "nota nueva" : "notas nuevas"}` : "Notificaciones"} aria-expanded={open} aria-controls="avisos-belen" title="Notificaciones de pedidos" onClick={() => setOpen(!open)} className="glass-chip relative grid size-9 place-items-center rounded-full text-text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {cuantas > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">{cuantas > 9 ? "9+" : cuantas}</span>}
      </button>
      {open && <section id="avisos-belen" aria-label="Notificaciones de pedidos" className="glass-pop absolute right-0 top-full z-40 mt-2 flex max-h-[min(30rem,calc(100dvh-5rem))] w-[22rem] max-w-[calc(100vw-2rem)] flex-col p-4">
        <div className="mb-2 flex shrink-0 items-center justify-between gap-3 border-b border-border pb-3">
          <h2 className="text-sm font-semibold">Notificaciones</h2>
          {cuantas > 0 && (
            <button type="button" onClick={marcarTodo} className="rounded-full px-2.5 py-1 text-xs font-semibold text-text-muted transition-colors hover:bg-[var(--hero-relleno)] hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-anillo)]">
              Marcar todo como visto
            </button>
          )}
        </div>
        {estado === "cargando" && <p role="status" className="py-3 text-sm text-text-muted">Comprobando notas…</p>}
        {estado === "error" && <p role="alert" className="py-2 text-sm text-text-muted">No se pudieron comprobar las notas. <button type="button" onClick={() => setIntento((n) => n + 1)} className="underline">Reintentar</button></p>}
        {estado === "listo" && marca !== null && cuantas === 0 && <p className="py-3 text-sm text-text-muted">Sin notas nuevas. Aquí avisan las notas «para todos» que escriba Oficina Técnica en un pedido.</p>}
        <ul className="scroll-thin min-h-0 space-y-1 overflow-y-auto">
          {avisos.map((a) => {
            const ultima = a.notas[0];
            return (
              <li key={a.pedido}>
                <button type="button" onClick={() => ver(a)} className="belen-notificacion block w-full px-3 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-text">{a.pedido}</span>
                    <time dateTime={ultima.creadoAt} className="text-[11px] text-text-muted">{new Date(ultima.creadoAt).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
                  </span>
                  <span className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-text-muted">{ultima.texto}</span>
                  <span className="mt-1.5 flex items-center justify-between gap-2 text-xs text-text-muted">
                    <span>{ultima.autor ?? ""}</span>
                    {a.notas.length > 1 && <span className="rounded-full bg-[var(--hero-relleno)] px-2 py-0.5 font-semibold tabular-nums">{a.notas.length} notas nuevas</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>}
    </div>
  );
}
