"use client";

import { useEffect, useState } from "react";
import { avisosPendientes, leerMarca, marcarVistas, resumenAviso, type AvisoPedido, type MarcaAvisos, type TonoAviso } from "@/lib/avisos-belen";
import { fmtCuandoNota, type NotaPedido } from "@/lib/nota-pedido";
import { usePopover } from "@/lib/usePopover";
import { usePersonas } from "../notas/usePersonas";
import { TextoNota } from "../notas/TextoNota";

/** El círculo con la inicial de quien escribe, del color del motivo: el mismo
 *  que su mención en la nota (ámbar persona, azul sección) o el verde azulado
 *  de «Nota nueva» en la campana de OT. */
const AVATAR: Record<TonoAviso, string> = {
  persona: "bg-brand-400 text-brand-950",
  seccion: "bg-sky-600 text-white",
  para: "bg-teal-600 text-white",
};

const inicial = (nombre: string) => nombre.trim().charAt(0).toUpperCase() || "?";

export function AvisosBelen({ miId, onAbrir }: { miId: string | null; onAbrir: (pedido: string) => void }) {
  const { open, setOpen, ref, panelRef, idPanel } = usePopover<HTMLDivElement>({ separacion: 8 });
  // Clave nueva a propósito: la vieja era la lista de ids vistos, y con ella
  // seguían saliendo todas las de antes (lib/avisos-belen.ts).
  const clave = `coordina.belen.avisos-notas:${miId ?? "local"}`;
  const [notas, setNotas] = useState<NotaPedido[]>([]);
  // Tus destinos («persona:belen», «seccion:produccion»): dicen por qué te
  // llega cada nota y qué mención es la tuya.
  const [misDestinos, setMisDestinos] = useState<string[]>([]);
  // El «hoy»/«ayer» de cada aviso se cuenta desde la última consulta.
  const [ahora, setAhora] = useState("");
  const personas = usePersonas();
  const nombreDe = (id: string) => personas.find((p) => p.id === id)?.nombre;
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
        const d = await r.json() as { avisos: NotaPedido[]; destinos?: string[] };
        if (!ctl.signal.aborted) { setNotas(d.avisos); setMisDestinos(d.destinos ?? []); setAhora(new Date().toISOString()); setEstado("listo"); }
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
      <button type="button" aria-label={cuantas ? `Notificaciones: ${cuantas} ${cuantas === 1 ? "nota nueva" : "notas nuevas"}` : "Notificaciones"} aria-expanded={open} popoverTarget={idPanel} title="Notificaciones de pedidos" className="glass-chip relative grid size-9 place-items-center rounded-full text-text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {cuantas > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">{cuantas > 9 ? "9+" : cuantas}</span>}
      </button>
      {/* Popover montado siempre (el botón lo abre por su id); el contenido, solo abierto. `open:flex` y no `flex`, que pisaría el `display: none` del cerrado. */}
      <section ref={panelRef} id={idPanel} popover="auto" aria-label="Notificaciones de pedidos" className="glass-pop max-h-[min(36rem,calc(100dvh-5rem))] w-[25rem] max-w-[calc(100vw-2rem)] flex-col p-4 text-text open:flex">
        {open && <>
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 px-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            Notificaciones
            {cuantas > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold tabular-nums text-white">{cuantas}</span>}
          </h2>
          {cuantas > 0 && (
            <button type="button" onClick={marcarTodo} className="rounded-full px-2.5 py-1 text-xs font-semibold text-text-muted transition-colors hover:bg-[var(--hero-relleno)] hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-anillo)]">
              Marcar todo como visto
            </button>
          )}
        </div>
        {estado === "cargando" && <p role="status" className="px-1 py-3 text-sm text-text-muted">Comprobando notas…</p>}
        {estado === "error" && <p role="alert" className="px-1 py-2 text-sm text-text-muted">No se pudieron comprobar las notas. <button type="button" onClick={() => setIntento((n) => n + 1)} className="underline">Reintentar</button></p>}
        {estado === "listo" && marca !== null && cuantas === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-[var(--hero-relleno)] text-text-muted">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <p className="text-sm font-semibold">Sin notas nuevas</p>
            <p className="text-xs leading-relaxed text-text-muted">Aquí avisan las notas en las que te mencionan con @ (a ti o a Producción) o que te dejan solo para ti.</p>
          </div>
        )}
        <ul className="scroll-thin min-h-0 space-y-2 overflow-y-auto">
          {avisos.map((a) => {
            const ultima = a.notas[0];
            const autor = ultima.autor ?? nombreDe(ultima.operarioId) ?? "Alguien";
            const { tono, accion } = resumenAviso(ultima, misDestinos);
            return (
              <li key={a.pedido}>
                <button type="button" onClick={() => ver(a)} className="belen-notificacion flex w-full items-start gap-3 p-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus">
                  <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${AVATAR[tono]}`}>{inicial(autor)}</span>
                  <span className="min-w-0 flex-1">
                    {/* Se lee como una frase: «Ángel te menciona en AR.26.05720». */}
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-sm leading-snug text-text-muted">
                        <span className="font-semibold text-text">{autor}</span> {accion} en{" "}
                        <span className="font-semibold tabular-nums text-text">{a.pedido}</span>
                      </span>
                      <time dateTime={ultima.creadoAt} title={new Date(ultima.creadoAt).toLocaleString("es-ES")} className="shrink-0 text-xs tabular-nums text-text-muted">{fmtCuandoNota(ultima.creadoAt, ahora)}</time>
                    </span>
                    <span className="mt-2 line-clamp-3 text-sm leading-normal text-text">
                      <TextoNota texto={ultima.texto} personas={personas} misDestinos={misDestinos} />
                    </span>
                    {a.notas.length > 1 && (
                      <span className="mt-2.5 inline-flex rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold tabular-nums text-text-muted">
                        +{a.notas.length - 1} {a.notas.length === 2 ? "nota más" : "notas más"} en este pedido
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        </>}
      </section>
    </div>
  );
}
