"use client";

import { useEffect, useState } from "react";
import {
  NOMBRES_IMPRESORA,
  TEXTO_TRABAJO,
  type EstadoTrabajo,
  type IdImpresora,
  type VistaImpresora,
} from "@/lib/impresoras";
import type { FilaImpresion } from "@/lib/server/impresion-cola";
import { PanelFlotante } from "./PanelFlotante";
import { useSoloLectura } from "./SoloLectura";

// ─── Las impresoras, de un vistazo ───────────────────────────────────────────
// Si se duda de si un planteamiento salió: aquí se ve si la web lo mandó, si
// sigue en la cola o si la impresora tiene un problema (Iván, 04/11/2026). Lo de
// cada impresora lo dice ella misma; la lista de envíos es lo que mandó la web.

type Envio = FilaImpresion & { impresoraId: IdImpresora | null; estadoEnImpresora: EstadoTrabajo | null };
interface Datos {
  modo: "off" | "ensayo" | "activo";
  impresoras: VistaImpresora[];
  envios: Envio[];
}

const REFRESCO_MS = 10_000;

const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

const TONO_IMPRESORA: Record<VistaImpresora["estado"], { texto: string; clase: string }> = {
  libre: { texto: "Libre", clase: "bg-teal-500/15 text-teal-800 dark:text-teal-300" },
  imprimiendo: { texto: "Imprimiendo", clase: "bg-sky-500/15 text-sky-800 dark:text-sky-300" },
  parada: { texto: "Parada", clase: "bg-red-500/15 text-red-700 dark:text-red-300" },
  sin_respuesta: { texto: "No responde", clase: "bg-red-500/15 text-red-700 dark:text-red-300" },
};

/** Qué pasó con un envío, juntando lo que guardó la web y lo que dice la impresora. */
function situacion(e: Envio): { texto: string; mal: boolean } {
  if (e.estado === "pendiente") return { texto: e.error ? `Sin mandar: ${e.error}` : "Esperando para mandarlo", mal: Boolean(e.error) };
  if (e.estado === "manual") return { texto: "Para imprimir a mano (no todo es A4)", mal: true };
  if (e.estado === "descartado") return { texto: `No se imprimió${e.error ? `: ${e.error}` : ""}`, mal: true };
  if (e.estadoEnImpresora) {
    const mal = e.estadoEnImpresora === "cancelado" || e.estadoEnImpresora === "abortado" || e.estadoEnImpresora === "parado";
    return { texto: TEXTO_TRABAJO[e.estadoEnImpresora], mal };
  }
  // Mandado, pero la impresora ya no lo tiene en su lista (las Konica guardan
  // los últimos): salió y se olvidó.
  return { texto: "Mandado", mal: false };
}

function Impresora({ i }: { i: VistaImpresora }) {
  const tono = TONO_IMPRESORA[i.estado];
  return (
    <div className="rounded-2xl bg-[var(--hero-relleno)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-text">{i.nombre}</h4>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tono.clase}`}>{tono.texto}</span>
        {i.avisos.map((a) => (
          <span key={a} className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
            {a}
          </span>
        ))}
        {i.tonerBajo.length > 0 && (
          <span className="text-[11px] text-text-muted">Tóner bajo: {i.tonerBajo.join(", ")}</span>
        )}
      </div>
      {i.estado !== "sin_respuesta" && (
        <p className="mt-1 text-[11px] text-text-muted">
          {i.papeles.length > 0 && <>Papel cargado: {i.papeles.join(", ")} · </>}
          {i.pendientes.length === 0 ? "Nada en cola" : `${i.pendientes.length} en cola`}
        </p>
      )}
      {i.pendientes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5">
          {i.pendientes.map((t) => (
            <li key={t.id} className="flex gap-2 text-xs text-text">
              <span className="min-w-0 flex-1 truncate">{t.nombre}</span>
              <span className="shrink-0 text-text-muted">{t.usuario ?? ""}</span>
              <span className="shrink-0 font-semibold">{TEXTO_TRABAJO[t.estado]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PanelImpresoras({ miId, onCerrar }: { miId: string | null; onCerrar: () => void }) {
  const soloLectura = useSoloLectura();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const pedir = () =>
      fetch("/api/impresoras", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Datos>) : Promise.reject(new Error())))
        .then((d) => {
          if (!vivo) return;
          setDatos(d);
          setError(false);
        })
        .catch(() => vivo && setError(true));
    pedir();
    const id = setInterval(pedir, REFRESCO_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [vuelta]);

  // Un envío del reparto se repite tal cual (mismas páginas, giro e impresora):
  // repetir el A5 no tiene por qué volver a sacar los A4. Los de antes, entero.
  const reimprimir = async (e: Envio) => {
    const pedido = e.pedidoId;
    const parte = e.repetible ? { id: e.id } : {};
    setOcupado(e.id);
    setMensaje(null);
    try {
      const r = await fetch("/api/planteamiento/reimprimir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido, operarioId: miId, ...parte }),
      });
      setMensaje(r.ok ? `${pedido}: enviado otra vez a la cola` : `${pedido}: no se ha podido reimprimir`);
      setVuelta((v) => v + 1);
    } catch {
      setMensaje(`${pedido}: no se ha podido reimprimir`);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <PanelFlotante titulo="Impresoras" onCerrar={onCerrar}>
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="text-sm font-bold text-text">Impresoras</h3>
        {datos?.modo === "ensayo" && <span className="text-[11px] text-text-muted">· en ensayo: todo sale en la de OT</span>}
        {datos?.modo === "off" && <span className="text-[11px] text-text-muted">· la impresión al pasar está apagada</span>}
      </div>
      {error && <p className="mb-2 text-xs text-text">No se pudo preguntar a las impresoras. Se reintenta solo.</p>}
      {!datos && !error && <p className="text-xs text-text-muted">Preguntando a las impresoras…</p>}
      {datos && (
        <>
          <div className="flex flex-col gap-2">
            {datos.impresoras.map((i) => (
              <Impresora key={i.id} i={i} />
            ))}
          </div>

          <h4 className="mb-1 mt-4 text-xs font-semibold text-text">Lo que ha mandado la web</h4>
          {mensaje && <p className="mb-1 text-[11px] text-text-muted">{mensaje}</p>}
          {datos.envios.length === 0 ? (
            <p className="text-xs text-text-muted">Todavía no ha mandado nada.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {datos.envios.map((e) => {
                const s = situacion(e);
                return (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg px-2 py-1 text-xs hover:bg-surface-2">
                    <span className="w-24 shrink-0 tabular-nums text-text-muted">{hora(e.enviadoAt ?? e.creadoAt)}</span>
                    <span className="w-28 shrink-0 font-semibold text-text">{e.pedidoId}</span>
                    <span className="min-w-0 flex-1 truncate text-text-muted" title={e.fichero ?? ""}>
                      {e.fichero}
                      {e.paginasSel && <> ({e.papel ?? "otro tamaño"}, pág. {e.paginasSel})</>}
                      {e.impresoraId && <> · {NOMBRES_IMPRESORA[e.impresoraId]}</>}
                    </span>
                    <span className={`shrink-0 font-semibold ${s.mal ? "text-red-700 dark:text-red-300" : "text-text"}`}>{s.texto}</span>
                    {!soloLectura && datos.modo !== "off" && (
                      <button
                        type="button"
                        disabled={ocupado !== null}
                        onClick={() => void reimprimir(e)}
                        title={e.repetible ? "Vuelve a mandar justo esto, a la misma impresora" : "Vuelve a buscar el planteamiento de este pedido y lo manda a la cola"}
                        className="chip-3d shrink-0 px-2.5 py-0.5 text-[11px] font-semibold text-text disabled:opacity-55"
                      >
                        {ocupado === e.id ? "Mandando…" : "Reimprimir"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </PanelFlotante>
  );
}
