"use client";

import { useEffect, useState } from "react";
import { fechaCorta } from "@/lib/vista-belen";
import { LISTAS_BELEN, type ColumnaLista, type FilaLista, type IdLista } from "@/lib/vista-belen-listas";

// ─── Una lista de comprobación de la pantalla de Belén ───────────────────────
// Genérica: pinta las columnas que declara su entrada en lib/vista-belen-listas
// y, al pinchar una fila con pedido, lo abre. Compacta para monitores pequeños.

type Estado = { tipo: "cargando" } | { tipo: "listo"; filas: FilaLista[] } | { tipo: "error"; mensaje: string };

function Celda({ col, valor }: { col: ColumnaLista; valor: string | number | null | undefined }) {
  if (valor === null || valor === undefined || valor === "") return <span className="text-text-muted">—</span>;
  switch (col.tipo) {
    case "fecha":
      return <span className="tabular-nums">{fechaCorta(String(valor))}</span>;
    case "numero":
      return <span className="tabular-nums">{valor}</span>;
    case "of":
      return <span className="font-mono font-semibold">{valor}</span>;
    case "pedido":
      return <span className="whitespace-nowrap font-semibold tabular-nums">{valor}</span>;
    default:
      return <>{valor}</>;
  }
}

export function TablaListaBelen({
  lista,
  onAbrir,
  onCuenta,
}: {
  lista: IdLista;
  onAbrir: (pedido: string, of: string | null) => void;
  /** Para poner el número de filas en el selector de listas. */
  onCuenta?: (lista: IdLista, n: number) => void;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const def = LISTAS_BELEN.find((l) => l.id === lista)!;

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/vista-belen?lista=${lista}`, { signal: ctl.signal, cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = "/entrar";
          return;
        }
        const json = (await r.json().catch(() => ({}))) as { filas?: FilaLista[]; error?: string };
        if (!r.ok || !json.filas) throw new Error(json.error ?? "No se pudo leer RPS");
        setEstado({ tipo: "listo", filas: json.filas });
        onCuenta?.(lista, json.filas.length);
      })
      .catch((e: Error) => {
        if (!ctl.signal.aborted) setEstado({ tipo: "error", mensaje: e.message });
      });
    return () => ctl.abort();
  }, [lista, onCuenta]);

  return (
    <section aria-label={def.label}>
      <p className="mb-2 px-1 text-[13px] text-text-muted">
        {def.explica} Solo pedidos AR.
        {estado.tipo === "listo" && estado.filas.length > 0 && " Pincha una fila para abrir su pedido."}
      </p>
      {estado.tipo === "cargando" && (
        <p className="px-1 text-sm text-text-muted" aria-live="polite">
          Cargando…
        </p>
      )}
      {estado.tipo === "error" && (
        <p className="px-1 text-sm font-semibold text-red-700 dark:text-red-300" role="alert">
          {estado.mensaje}
        </p>
      )}
      {estado.tipo === "listo" &&
        (estado.filas.length === 0 ? (
          <p className="px-1 text-sm text-text-muted">No hay ninguna ahora mismo.</p>
        ) : (
          <div className="overflow-x-auto rounded-3xl bg-surface shadow-[var(--hero-sombra-panel)]">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wide text-text-muted">
                  {def.columnas.map((c) => (
                    <th
                      key={c.clave}
                      scope="col"
                      className={`px-2.5 py-2 font-semibold first:pl-4 last:pr-4 ${c.tipo === "numero" ? "text-right" : ""}`}
                    >
                      {c.titulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {estado.filas.map((f) => {
                  const abrir = f.pedido ? () => onAbrir(f.pedido!, f.of) : undefined;
                  return (
                    <tr
                      key={f.clave}
                      className={`border-t border-border ${abrir ? "cursor-pointer hover:bg-[var(--hero-relleno)]" : ""}`}
                      onClick={abrir}
                    >
                      {def.columnas.map((c, i) => (
                        <td
                          key={c.clave}
                          className={`px-2.5 py-1.5 align-top first:pl-4 last:pr-4 ${c.tipo === "numero" ? "text-right" : ""} ${
                            c.ancho ? `${c.ancho} truncate` : ""
                          }`}
                          title={c.ancho && f[c.clave] !== null ? String(f[c.clave]) : undefined}
                        >
                          {/* La primera columna con pedido es la que se alcanza con
                              el teclado; la fila entera responde al ratón. */}
                          {i === 0 && abrir ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                abrir();
                              }}
                              aria-label={`Abrir ${f.pedido}${f.of ? `, OF ${f.of}` : ""}`}
                              className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            >
                              <Celda col={c} valor={f[c.clave]} />
                            </button>
                          ) : (
                            <Celda col={c} valor={f[c.clave]} />
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
    </section>
  );
}
