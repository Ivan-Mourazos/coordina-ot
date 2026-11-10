"use client";

import { fechaCorta } from "@/lib/vista-belen";
import { LISTAS_BELEN, type ColumnaLista, type FilaLista, type IdLista } from "@/lib/vista-belen-listas";

// ─── Una lista de comprobación de la pantalla de Belén ───────────────────────
// Genérica: pinta las columnas que declara su entrada en lib/vista-belen-listas
// y, al pinchar una fila con pedido, lo abre. Compacta para monitores pequeños.
//
// No pide nada: las listas las carga la pantalla al entrar, todas a la vez, y
// aquí llega lo que haya. Así cambiar de lista es instantáneo y los números de
// los botones están desde el principio (Iván, 10/11/2026).

export type CargaLista =
  | { tipo: "cargando" }
  | { tipo: "listo"; filas: FilaLista[]; calculadaAt: string; actualizando?: boolean }
  | { tipo: "error"; mensaje: string };

/** «hace 3 min»: las listas se calculan cada pocos minutos y conviene saber
 *  de cuándo es lo que se mira. */
function haceCuanto(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  return `a las ${new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Color de una etiqueta de estado según lo que dice: lo acabado o subido en
 *  verde, lo parado o lo que falta en rojo, lo que está en marcha en ámbar. */
function claseEstado(valor: string): string {
  const v = valor.trim().toUpperCase();
  if (v === "SI" || v === "FINALIZADA") return "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300";
  if (v === "NO" || v === "DETENIDA") return "bg-red-500/12 text-red-800 dark:text-red-300";
  if (v === "CON IMPUTACIONES") return "bg-amber-500/15 text-amber-900 dark:text-amber-200";
  return "bg-[var(--hero-relleno)] text-text";
}

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
    case "estado":
      return (
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${claseEstado(String(valor))}`}>
          {String(valor).charAt(0) + String(valor).slice(1).toLowerCase()}
        </span>
      );
    default:
      return <>{valor}</>;
  }
}

/** Esqueleto mientras llega la primera vez: la tabla ocupa su sitio y no salta. */
function Esqueleto() {
  return (
    <div className="rounded-3xl bg-surface p-4 shadow-[var(--hero-sombra-panel)]" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="mb-2.5 h-4 animate-pulse rounded bg-[var(--hero-relleno)] motion-reduce:animate-none" />
      ))}
    </div>
  );
}

export function TablaListaBelen({
  lista,
  carga,
  onAbrir,
  onActualizar,
}: {
  lista: IdLista;
  carga: CargaLista;
  onAbrir: (pedido: string, of: string | null) => void;
  onActualizar: () => void;
}) {
  const def = LISTAS_BELEN.find((l) => l.id === lista)!;

  return (
    <section aria-label={def.label} aria-busy={carga.tipo === "cargando"}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1 text-[13px] text-text-muted">
        <p>
          {def.explica} Solo pedidos AR.
          {carga.tipo === "listo" && carga.filas.length > 0 && " Pincha una fila para abrir su pedido."}
        </p>
        {carga.tipo === "listo" && (
          <p className="flex items-center gap-2">
            <span>{carga.actualizando ? "Actualizando…" : `Actualizada ${haceCuanto(carga.calculadaAt)}`}</span>
            <button
              type="button"
              onClick={onActualizar}
              disabled={carga.actualizando}
              className="rounded-full bg-[var(--hero-relleno)] px-2.5 py-0.5 text-[12px] font-semibold text-text hover:bg-[var(--hero-relleno-encima)] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Actualizar
            </button>
          </p>
        )}
      </div>
      {carga.tipo === "cargando" && <Esqueleto />}
      {carga.tipo === "error" && (
        <p className="px-1 text-sm font-semibold text-red-700 dark:text-red-300" role="alert">
          {carga.mensaje}{" "}
          <button type="button" onClick={onActualizar} className="underline">
            Reintentar
          </button>
        </p>
      )}
      {carga.tipo === "listo" &&
        (carga.filas.length === 0 ? (
          <p className="px-1 text-sm text-text-muted">No hay ninguna ahora mismo.</p>
        ) : (
          <div className="tarjeta-of overflow-x-auto rounded-3xl bg-surface">
            <div className="flex items-baseline gap-2.5 px-4 pb-1 pt-3">
              <span className="text-[22px] font-bold leading-none tabular-nums">{carga.filas.length}</span>
              <span className="text-[14px] font-semibold">{def.label}</span>
            </div>
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
                {carga.filas.map((f) => {
                  const abrir = f.pedido ? () => onAbrir(f.pedido!, f.of) : undefined;
                  return (
                    <tr
                      key={f.clave}
                      className={`border-t border-border transition-colors ${abrir ? "cursor-pointer hover:bg-[var(--hero-relleno)] active:bg-[var(--hero-relleno-encima)]" : ""}`}
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
                          {/* La primera columna es la que se alcanza con el
                              teclado; la fila entera responde al ratón. */}
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
