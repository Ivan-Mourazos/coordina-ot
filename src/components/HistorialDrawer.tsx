"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HistorialPedidoDetalle } from "@/lib/historial";
import { PRIORIDAD, fmtMin } from "@/lib/estado";
import { FamiliaTag } from "./FamiliaTag";

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Drawer read-only del historial: PDF (mediano, ampliable) + datos del pedido y
 *  sus OFs con tiempos. Sin acciones (el pedido está finalizado). */
export function HistorialDrawer({
  pedido,
  onClose,
}: {
  pedido: string | null;
  onClose: () => void;
}) {
  const [detalle, setDetalle] = useState<HistorialPedidoDetalle | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [ampliado, setAmpliado] = useState(false);
  const reqSeq = useRef(0);

  const [prevPedido, setPrevPedido] = useState<string | null>(null);
  // Reset al cambiar de pedido DURANTE el render (no en un efecto): así nunca
  // hay un frame con la cabecera del pedido nuevo y los datos/PDF del anterior.
  if (pedido !== prevPedido) {
    setPrevPedido(pedido);
    setDetalle(null);
    setError(false);
    setAmpliado(false);
  }

  const cargar = useCallback(async (cod: string) => {
    const seq = ++reqSeq.current;
    setCargando(true);
    setError(false);
    try {
      const r = await fetch(`/api/historial/${cod}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as HistorialPedidoDetalle;
      if (seq !== reqSeq.current) return; // respuesta de un pedido anterior: la ignoramos
      setDetalle(d);
    } catch {
      if (seq !== reqSeq.current) return;
      setError(true);
    } finally {
      if (seq === reqSeq.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!pedido) return;
    // `cargar` llama a setState de forma síncrona (setCargando/setError/setDetalle);
    // se difiere con setTimeout(0) para que el propio efecto no dispare setState
    // sincrónicamente (react-hooks/set-state-in-effect), sin recurrir a un disable.
    const id = setTimeout(() => cargar(pedido), 0);
    return () => clearTimeout(id);
  }, [pedido, cargar]);

  useEffect(() => {
    if (!pedido) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (ampliado) setAmpliado(false);
        else onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pedido, ampliado, onClose]);

  if (!pedido) return null;
  const scanUrl = detalle?.scanUrl ?? `/api/pedidos/${pedido}.pdf`;
  // La ruta de PDFs solo resuelve AR.*; para otras series se avisa en vez de romper.
  const pdfSoportado = /^AR\./.test(pedido);

  return (
    <div className="fixed inset-0 z-50">
      <div className="overlay-in absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

      {/* PDF mediano a la izquierda */}
      <div className="overlay-in absolute inset-y-0 left-0 right-[32rem] flex flex-col p-6" onClick={onClose}>
        <div className="min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
          {pdfSoportado ? (
            <div className="relative h-full w-full">
              <iframe
                src={`${scanUrl}#view=Fit`}
                title={`Pedido ${pedido}`}
                className="h-full w-full rounded-xl border-none bg-white"
              />
              <button
                onClick={() => setAmpliado(true)}
                className="absolute right-3 top-3 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/80"
              >
                Ampliar ⤢
              </button>
            </div>
          ) : (
            <div className="grid h-full w-full place-items-center rounded-xl bg-surface-2 text-sm text-text-muted">
              PDF no disponible para esta serie
            </div>
          )}
        </div>
      </div>

      {/* Panel derecho: datos + OFs */}
      <aside className="glass-panel-strong drawer-in absolute right-0 top-0 flex h-full w-full max-w-lg flex-col rounded-l-2xl">
        <header className="flex items-start gap-3 p-4" style={{ boxShadow: "inset 0 -1px 0 0 var(--glass-border)" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-lg font-bold text-text">{pedido}</h2>
              {detalle && (
                <span
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white"
                  style={{ background: PRIORIDAD[detalle.prioridad].color }}
                  title={`Prioridad ${PRIORIDAD[detalle.prioridad].label}`}
                >
                  P{detalle.prioridad} {PRIORIDAD[detalle.prioridad].label}
                </span>
              )}
            </div>
            <p className="truncate text-sm text-text-muted">
              {detalle?.cliente ?? "—"}
              {detalle?.negocio && <span className="font-semibold text-text"> · {detalle.negocio}</span>}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar"
            className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text">
            ✕
          </button>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto p-4">
          {cargando && <p className="text-sm text-text-muted">Cargando…</p>}
          {error && (
            <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-text">
              No se pudo cargar el pedido.
              <button onClick={() => cargar(pedido)} className="rounded-lg bg-surface px-2 py-1 text-xs font-semibold ring-1 ring-border hover:bg-surface-2">
                Reintentar
              </button>
            </div>
          )}

          {detalle && !cargando && (
            <>
              <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                <Meta k="Solicitud" v={fmtFecha(detalle.fechaSolicitud)} />
                <Meta k="Finalización" v={fmtFecha(detalle.fechaFinalizacion)} />
                <Meta k="Piezas" v={String(detalle.piezas)} />
                {detalle.ciudadEntrega && <Meta k="Entrega en" v={detalle.ciudadEntrega} />}
                <div className="col-span-2">
                  <dt className="mb-1 text-text-muted">Familias</dt>
                  <dd className="flex flex-wrap gap-1">
                    {detalle.familias.map((f) => <FamiliaTag key={f} familia={f} />)}
                  </dd>
                </div>
              </dl>

              {detalle.comentarioVenta && (
                <div className="mb-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] p-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Comentario del pedido</p>
                  <p className="whitespace-pre-line text-[11px] leading-snug text-text">{detalle.comentarioVenta}</p>
                </div>
              )}

              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Órdenes de fabricación ({detalle.ofs.length})
              </h3>
              <ul className="space-y-2">
                {detalle.ofs.map((of) => (
                  <li key={of.codigo} className="glass-chip rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-text">{of.codigo}</span>
                      <span className="ml-auto rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-text ring-1 ring-border">
                        {fmtMin(of.tiempoImputadoMin)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text">{of.descripcion}</p>
                    <p className="mt-1 text-[11px] text-text-muted">
                      {of.quien.length > 0 ? of.quien.join(", ") : "—"}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>

      {/* Ampliado: PDF a pantalla casi completa */}
      {ampliado && pdfSoportado && (
        <div className="overlay-in fixed inset-0 z-[80] bg-black/70 backdrop-blur-md" onClick={() => setAmpliado(false)}>
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 p-4 text-white">
            <span className="font-mono text-sm font-bold">{pedido}</span>
            <a href={scanUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
              className="ml-auto rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20">
              Abrir original ↗
            </a>
            <button onClick={() => setAmpliado(false)} aria-label="Cerrar"
              className="grid size-9 place-items-center rounded-lg bg-white/10 text-lg hover:bg-white/20">✕</button>
          </div>
          <div className="grid h-full place-items-center p-10" onClick={() => setAmpliado(false)}>
            <iframe src={scanUrl} title={`Pedido ${pedido}`} onClick={(e) => e.stopPropagation()}
              className="h-full w-full max-w-5xl rounded-xl bg-white shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-text-muted">{k}</dt>
      <dd className="font-medium text-text">{v}</dd>
    </div>
  );
}
