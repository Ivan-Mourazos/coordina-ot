"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import { enFrase, fechaCorta } from "@/lib/vista-belen";
import {
  columnaFecha,
  filtrarLista,
  FILTRO_LISTA_INICIAL,
  LISTAS_BELEN,
  type ColumnaLista,
  type FilaLista,
  type FiltroLista,
  type IdLista,
  valoresFiltro,
} from "@/lib/vista-belen-listas";
import { BotonLimpiar, CabeceraOrdenable, CampoBuscar, FiltroFechas, Seleccion, siguienteOrden } from "./Filtros";
import { chip, tonoSituacion } from "./estilos-belen";

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
        <span className={chip(tonoSituacion(String(valor)))}>{enFrase(String(valor))}</span>
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
  filtro,
  setFiltro,
  onAbrir,
  onActualizar,
}: {
  lista: IdLista;
  carga: CargaLista;
  /** Los filtros de ESTA lista. Los guarda la pantalla, no la tabla: así
   *  siguen puestos al abrir un pedido y volver (Iván, 12/11/2026). */
  filtro: FiltroLista;
  setFiltro: Dispatch<SetStateAction<FiltroLista>>;
  onAbrir: (pedido: string, of: string | null) => void;
  onActualizar: () => void;
}) {
  const def = LISTAS_BELEN.find((l) => l.id === lista)!;
  const fecha = columnaFecha(def);
  const filas = useMemo(() => (carga.tipo === "listo" ? filtrarLista(carga.filas, def, filtro) : []), [carga, def, filtro]);
  const valores = useMemo(() => (carga.tipo === "listo" ? valoresFiltro(carga.filas, def) : []), [carga, def]);
  const filtrando = filtro.texto !== "" || filtro.desde !== "" || filtro.hasta !== "" || filtro.valor !== "" || filtro.orden !== null;

  return (
    <section aria-label={def.label} aria-busy={carga.tipo === "cargando"}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1 text-[13px] text-text-muted">
        <p>
          {def.explica} {def.alcance ?? "Solo pedidos AR."}
          {def.amarillo && (
            <>
              {" "}
              <span className="rounded bg-[var(--belen-avisos-hechos)] px-1 text-text">{def.amarillo}</span>
            </>
          )}
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
      {carga.tipo === "listo" && carga.filas.length > 0 && (
        <div className="mb-3 flex flex-wrap items-end gap-2.5">
          <CampoBuscar valor={filtro.texto} onCambiar={(texto) => setFiltro((f) => ({ ...f, texto }))} pista="OF, pedido, cliente, tarea…" />
          {def.filtro && valores.length > 0 && (
            <Seleccion
              etiqueta={def.filtro.titulo}
              valor={filtro.valor}
              opciones={[["", "Todos"], ...valores.map((v) => [v, v] as const)]}
              onCambiar={(valor) => setFiltro((f) => ({ ...f, valor }))}
            />
          )}
          {fecha && (
            <FiltroFechas
              etiqueta={fecha.titulo}
              desde={filtro.desde}
              hasta={filtro.hasta}
              onCambiar={(desde, hasta) => setFiltro((f) => ({ ...f, desde, hasta }))}
            />
          )}
          {filtrando && <BotonLimpiar onClick={() => setFiltro(FILTRO_LISTA_INICIAL)} />}
        </div>
      )}
      {carga.tipo === "listo" &&
        (carga.filas.length === 0 ? (
          <p className="px-1 text-sm text-text-muted">No hay ninguna ahora mismo.</p>
        ) : (
          <div className="tarjeta-of overflow-x-auto rounded-3xl bg-surface">
            <div className="flex items-baseline gap-2.5 px-4 pb-1 pt-3">
              <span className="text-[22px] font-bold leading-none tabular-nums">{filas.length}</span>
              <span className="text-[14px] font-semibold">{def.label}</span>
              {filas.length !== carga.filas.length && <span className="text-[13px] text-text-muted">de {carga.filas.length}</span>}
            </div>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {def.columnas.map((c) => (
                    <CabeceraOrdenable
                      key={c.clave}
                      clave={c.clave}
                      titulo={c.titulo}
                      orden={filtro.orden}
                      derecha={c.tipo === "numero"}
                      onOrdenar={(clave) => setFiltro((f) => ({ ...f, orden: siguienteOrden(f.orden, clave) }))}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <tr>
                    <td colSpan={def.columnas.length} className="px-4 py-3 text-sm text-text-muted">
                      Ninguna fila cumple los filtros.
                    </td>
                  </tr>
                )}
                {filas.map((f) => {
                  const abrir = f.pedido ? () => onAbrir(f.pedido!, f.of) : undefined;
                  const amarilla = !!f.amarilla;
                  return (
                    <tr
                      key={f.clave}
                      className={`border-t border-border transition-colors ${amarilla ? "bg-[var(--belen-avisos-hechos)]" : ""} ${abrir ? `cursor-pointer ${amarilla ? "hover:bg-[var(--belen-avisos-hechos-encima)]" : "hover:bg-[var(--hero-relleno)]"} active:bg-[var(--hero-relleno-encima)] focus-within:bg-[var(--hero-relleno)] focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-[var(--hero-anillo)]` : ""}`}
                      onClick={abrir}
                    >
                      {def.columnas.map((c, i) => (
                        <td
                          key={c.clave}
                          className={`px-2.5 py-1.5 align-top first:pl-4 last:pr-4 ${c.tipo === "numero" ? "text-right" : ""} ${
                            c.ancho ? `${c.ancho} truncate` : ""
                          }`}
                          title={c.ancho && f[c.clave] != null ? String(f[c.clave]) : undefined}
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
                              className="rounded focus:outline-none"
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
