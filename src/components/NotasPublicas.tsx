"use client";

import { fmtCuandoNota, type NotaPublica } from "@/lib/nota-pedido";
import { AcentoBloque } from "./AcentoBloque";

// ─── Las notas «para todos», en la consulta sin sesión ───────────────────────
// Lo que OT quiere que sepan Producción y los comerciales (19/10/2026). Con
// quién la escribió y cuándo: a quien la lee le sirve saber a quién preguntar.
// Solo lectura: escribir sigue siendo cosa de OT.
//
// Sin notas no se pinta nada: en la consulta es lo normal, y un bloque vacío
// solo empuja hacia abajo lo que se viene a mirar.

export function NotasPublicas({ notas }: { notas: readonly NotaPublica[] }) {
  if (notas.length === 0) return null;
  const ahora = new Date().toISOString();
  return (
    <div className="bloque-3d rounded-xl border-border px-3 py-2.5 [background:var(--surface)]">
      <div data-bloque="notas" className="cabecera-bloque mb-2 flex items-center gap-2">
        <AcentoBloque tipo="notas" />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text">
          Notas de Oficina Técnica ({notas.length})
        </p>
      </div>
      <ul className="space-y-2">
        {notas.map((n, i) => (
          <li key={i} className="recuadro rounded-lg px-3 py-2">
            <p className="flex flex-wrap items-baseline gap-x-1.5 text-[11px]">
              <span className="font-semibold text-text">{n.autor}</span>
              <time
                dateTime={n.creadoAt}
                title={new Date(n.creadoAt).toLocaleString("es-ES")}
                className="text-text-muted"
              >
                · {fmtCuandoNota(n.creadoAt, ahora)}
              </time>
              {n.editadoAt && <span className="text-text-muted">· editada</span>}
            </p>
            <p className="mt-1 whitespace-pre-line break-words text-[13px] leading-relaxed text-text">{n.texto}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** La marca de la lista: el pedido tiene notas para todos. Pequeña, junto al
 *  código, para no quitar sitio a las columnas. */
export function MarcaNotas({ n }: { n: number }) {
  return (
    <span
      title={n === 1 ? "Tiene 1 nota de Oficina Técnica" : `Tiene ${n} notas de Oficina Técnica`}
      className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 py-px align-middle font-sans text-[10px] font-semibold text-amber-800 dark:text-amber-300"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16v12H8l-4 4z" />
      </svg>
      {n}
      <span className="sr-only">{n === 1 ? " nota" : " notas"}</span>
    </span>
  );
}
