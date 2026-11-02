"use client";

import { useEffect, useState } from "react";
import {
  ESTADOS_SOLICITUD,
  sinCoger,
  type EstadoSolicitud,
  type Solicitud,
} from "@/lib/solicitudes";
import type { SeccionId } from "@/lib/secciones";
import { VisorDocumento, type DocumentoAbrible } from "./VisorDocumento";

// ─── Solicitudes de comerciales ──────────────────────────────────────────────
// Una tarjeta por solicitud, aunque en RPS sean varias tareas seguidas (ver
// lib/solicitudes.ts). Solo lectura: se coge en RPS y aquí se ve al refrescar.

const REFRESCO_MS = 60_000;
const APARTADOS = Object.entries(ESTADOS_SOLICITUD) as [EstadoSolicitud, string][];
/** Los adjuntos de una solicitud, en la forma que entiende el visor de la web. */
function documentosDe(s: Solicitud): DocumentoAbrible[] {
  return s.adjuntos.map((a) => ({
    descripcion: a.archivo,
    archivo: a.archivo,
    clase: "Adjunto del comercial",
    url: `/api/solicitudes/adjunto/${a.tarea}/${a.numero}`,
  }));
}

const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

const TONO: Record<EstadoSolicitud, string> = {
  sin_coger: "bg-brand-400/20 text-text",
  cogida: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  terminada: "bg-teal-500/15 text-teal-800 dark:text-teal-300",
};

function etiquetaEstado(s: { estado: EstadoSolicitud; tecnico: string | null }): string {
  if (s.estado === "sin_coger") return "Sin coger";
  if (s.estado === "cogida") return s.tecnico ? `La tiene ${s.tecnico}` : "Cogida";
  return s.tecnico ? `Hecha por ${s.tecnico}` : "Terminada";
}

function Tarjeta({ s }: { s: Solicitud }) {
  // El visor va dentro de la tarjeta: sus flechas pasean por sus adjuntos.
  const [enVisor, setEnVisor] = useState<number | null>(null);
  const documentos = documentosDe(s);
  return (
    <li id={`solicitud-${s.id}`} className="tarjeta-rectificado scroll-mt-20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-text">{s.descripcion || s.tipo}</h3>
          <p className="mt-0.5 text-xs text-text-muted">
            {s.tipo} · {s.comercial} · {fmt(s.fecha)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${TONO[s.estado]}`}>{etiquetaEstado(s)}</span>
      </div>

      {(s.oportunidad || s.presupuesto) && (
        <p className="mt-2 text-xs tabular-nums text-text-muted">
          {s.oportunidad && <>Oportunidad {s.oportunidad}</>}
          {s.oportunidad && s.presupuesto && " · "}
          {s.presupuesto && <>Presupuesto {s.presupuesto}</>}
        </p>
      )}

      {s.comentario && (
        <div className="mt-3 rounded-2xl bg-brand-400/15 px-4 py-3">
          <p className="text-[11px] font-semibold text-text-muted">Qué pide</p>
          <p className="mt-0.5 whitespace-pre-line text-sm text-text">{s.comentario}</p>
        </div>
      )}

      {s.respuesta && (
        <div className="mt-2 rounded-2xl bg-[var(--hero-relleno)] px-4 py-3">
          <p className="text-[11px] font-semibold text-text-muted">Respuesta del técnico</p>
          <p className="mt-0.5 whitespace-pre-line text-sm text-text">{s.respuesta}</p>
        </div>
      )}

      {s.avisoPendiente && <p className="mt-2 text-xs text-text-muted">El comercial aún no ha leído el aviso.</p>}

      {s.adjuntos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {documentos.map((d, i) => (
            <button
              key={d.url}
              type="button"
              onClick={() => setEnVisor(i)}
              title={`Abre ${d.archivo}`}
              className="chip-3d max-w-full truncate px-3.5 py-1.5 text-xs font-semibold text-text"
            >
              {d.archivo}
            </button>
          ))}
        </div>
      )}

      {s.relacionadas.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-text-muted">Misma oportunidad</p>
          <ul className="mt-1 flex flex-col gap-1">
            {s.relacionadas.map((r) => (
              <li key={r.id} className="text-xs text-text">
                {fmt(r.fecha)} · {r.tipo} · {etiquetaEstado(r)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer font-semibold text-text-muted">Pasos en RPS</summary>
        <ol className="mt-2 flex flex-col gap-1">
          {s.pasos.map((p, i) => (
            <li key={i} className="text-text">
              <span className="tabular-nums text-text-muted">{fmt(p.fecha)}</span> · {p.texto}
              {p.quien && <> · {p.quien}</>}
              {p.abierto && <span className="text-text-muted"> · pendiente</span>}
            </li>
          ))}
        </ol>
      </details>

      {enVisor !== null && (
        <VisorDocumento documentos={documentos} indice={enVisor} onIr={setEnVisor} onCerrar={() => setEnVisor(null)} />
      )}
    </li>
  );
}

export function SolicitudesView({
  seccion,
  onSinCoger,
}: {
  seccion: SeccionId;
  /** Para el contador de la pestaña. */
  onSinCoger: (n: number) => void;
}) {
  const [filas, setFilas] = useState<Solicitud[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apartado, setApartado] = useState<EstadoSolicitud>("sin_coger");

  useEffect(() => {
    let vivo = true;
    const pedir = () => {
      fetch(`/api/solicitudes?seccion=${seccion}`, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json() as Promise<{ solicitudes: Solicitud[] }>;
        })
        .then((d) => {
          if (!vivo) return;
          setFilas(d.solicitudes);
          setError(null);
          onSinCoger(sinCoger(d.solicitudes));
        })
        .catch(() => {
          if (vivo) setError("No se pudieron cargar las solicitudes. Prueba otra vez en un momento.");
        });
    };
    pedir();
    const id = setInterval(pedir, REFRESCO_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [seccion, onSinCoger]);

  const visibles = filas?.filter((s) => s.estado === apartado) ?? [];

  return (
    <section className="mx-auto max-w-4xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-text">Solicitudes</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Lo que piden los comerciales por workflow. Para coger una, hazlo en RPS: aquí se actualiza sola.
          </p>
        </div>
        <div className="tira-3d glass-chip inline-flex rounded-lg p-1" role="group" aria-label="Qué solicitudes ver">
          {APARTADOS.map(([id, texto]) => (
            <button
              key={id}
              type="button"
              aria-pressed={apartado === id}
              onClick={() => setApartado(id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${apartado === id ? "pestana-activa" : ""}`}
            >
              {texto}
              <span className="ml-1.5 font-normal tabular-nums">{filas?.filter((s) => s.estado === id).length ?? 0}</span>
            </button>
          ))}
        </div>
      </header>
      {error && <p role="alert" className="mb-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-text">{error}</p>}
      {!filas && !error && (
        <div aria-label="Cargando" className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="tarjeta-rectificado h-44 animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      )}
      {filas && visibles.length === 0 && (
        <div className="tarjeta-rectificado grid min-h-56 place-items-center px-6 text-center">
          <p className="text-sm font-semibold text-text">No hay solicitudes aquí</p>
        </div>
      )}
      {visibles.length > 0 && <ul className="flex flex-col gap-3">{visibles.map((s) => <Tarjeta key={s.id} s={s} />)}</ul>}
    </section>
  );
}
