"use client";

import { fechaCorta } from "@/lib/vista-belen";
import { LISTAS_BELEN, type FilaLista, type IdLista } from "@/lib/vista-belen-listas";
import { AcentoBloque } from "../AcentoBloque";
import type { CargaLista } from "./ListaBelen";

// ─── La página de inicio de Belén ────────────────────────────────────────────
// Lo que se ve debajo del buscador antes de buscar nada (Iván, 10/11/2026):
//   1. Sus pedidos recientes, a un clic (los recuerda el navegador).
//   2. Las comprobaciones con su número: qué hay que mirar hoy.
//   3. Las fechas comprometidas de esta semana y las que ya pasaron sin subir.
// Todo sale de lo que la pantalla ya carga al entrar: no pide nada nuevo a RPS.

export interface PedidoReciente {
  codigo: string;
  cliente: string | null;
}

const CLAVE_RECIENTES = "coordina.belen.recientes";
const MAX_RECIENTES = 8;

export function leerRecientes(): PedidoReciente[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_RECIENTES) ?? "[]") as PedidoReciente[];
    return Array.isArray(v) ? v.slice(0, MAX_RECIENTES) : [];
  } catch {
    return [];
  }
}

/** El que acaba de abrir, el primero; sin repetir. */
export function apuntarReciente(p: PedidoReciente): PedidoReciente[] {
  const lista = [p, ...leerRecientes().filter((r) => r.codigo !== p.codigo)].slice(0, MAX_RECIENTES);
  try {
    localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(lista));
  } catch {
    // Sin almacenamiento (modo privado): no pasa nada, solo no se recuerda.
  }
  return lista;
}

const masDias = (hoy: string, dias: number) => {
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Fechas comprometidas que importan HOY, por fecha:
 *  · proximas: las de los próximos 7 días (hoy incluido);
 *  · vencidas: las que pasaron la ÚLTIMA semana sin bultos subidos;
 *  · antiguas: cuántas más viejas siguen sin subir (en la lista entera hay
 *    pedidos de marzo; listarlas aquí taparía las de esta semana). */
export function comprometidasDeLaSemana(
  filas: readonly FilaLista[],
  hoy: string,
): { proximas: FilaLista[]; vencidas: FilaLista[]; antiguas: number } {
  const fecha = (f: FilaLista) => String(f.fechaComprometida ?? "");
  const porFecha = (a: FilaLista, b: FilaLista) => fecha(a).localeCompare(fecha(b));
  const sinSubir = (f: FilaLista) => f.bultosSubidos !== "SI";
  const haceSiete = masDias(hoy, -7);
  return {
    proximas: filas.filter((f) => fecha(f) >= hoy && fecha(f) <= masDias(hoy, 7)).sort(porFecha),
    vencidas: filas.filter((f) => fecha(f) >= haceSiete && fecha(f) < hoy && sinSubir(f)).sort(porFecha),
    antiguas: filas.filter((f) => fecha(f) && fecha(f) < haceSiete && sinSubir(f)).length,
  };
}

function Titulo({ tipo, children, derecha }: { tipo: Parameters<typeof AcentoBloque>[0]["tipo"]; children: React.ReactNode; derecha?: React.ReactNode }) {
  return (
    <h2 data-bloque={tipo} className="cabecera-bloque mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
      <AcentoBloque tipo={tipo} />
      {children}
      {derecha && <span className="ml-auto text-[12px] font-normal text-text-muted">{derecha}</span>}
    </h2>
  );
}

const PULSABLE =
  "transition-[transform,background-color] duration-150 hover:bg-[var(--hero-relleno)] active:scale-[.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-reduce:transition-none";

export function InicioBelen({
  recientes,
  listas,
  onAbrirPedido,
  onAbrirLista,
}: {
  recientes: PedidoReciente[];
  listas: Partial<Record<IdLista, CargaLista>>;
  onAbrirPedido: (codigo: string, of?: string | null) => void;
  onAbrirLista: (id: IdLista) => void;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const fechas = listas["fechas-comprometidas"];
  const semana = fechas?.tipo === "listo" ? comprometidasDeLaSemana(fechas.filas, hoy) : null;

  return (
    <div className="mt-1 flex flex-col gap-3">
      {/* 1. Recientes */}
      {recientes.length > 0 && (
        <section aria-label="Pedidos recientes">
          <Titulo tipo="recorrido">Abiertos hace poco</Titulo>
          <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))]">
            {recientes.map((r) => (
              <button
                key={r.codigo}
                type="button"
                onClick={() => onAbrirPedido(r.codigo)}
                className={`tarjeta-of min-w-0 rounded-2xl bg-surface px-3 py-2 text-left ${PULSABLE}`}
              >
                <span className="block text-[14px] font-bold tabular-nums">{r.codigo}</span>
                <span className="block truncate text-[12px] text-text-muted">{r.cliente ?? "—"}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 2. Qué hay que mirar hoy */}
      <section aria-label="Comprobaciones">
        <Titulo tipo="tareas">Qué hay que mirar</Titulo>
        <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))]">
          {LISTAS_BELEN.map((l) => {
            const c = listas[l.id];
            const n = c?.tipo === "listo" ? c.filas.length : null;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => onAbrirLista(l.id)}
                title={l.explica}
                className={`tarjeta-of min-w-0 rounded-2xl bg-surface px-3 py-2.5 text-left ${PULSABLE}`}
              >
                <span
                  className={`block text-[22px] font-bold leading-tight tabular-nums ${
                    n === null ? "text-text-muted" : n > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  {n === null ? "…" : n}
                </span>
                <span className="block text-[12.5px] font-medium leading-snug">{l.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Fechas comprometidas de esta semana */}
      <section aria-label="Fechas comprometidas de esta semana" className="tarjeta-of rounded-3xl bg-surface px-4 py-3">
        <Titulo
          tipo="recorrido"
          derecha={
            <button type="button" onClick={() => onAbrirLista("fechas-comprometidas")} className="font-semibold hover:text-text hover:underline">
              Ver todas
            </button>
          }
        >
          Fechas comprometidas: esta semana
        </Titulo>
        {!semana ? (
          <p className="text-[13px] text-text-muted">Cargando…</p>
        ) : (
          <>
          {semana.vencidas.length + semana.proximas.length === 0 && (
            <p className="text-[13px] text-text-muted">Nada vence en los próximos 7 días ni venció la semana pasada sin subir.</p>
          )}
          <ul className="flex flex-col">
            {[...semana.proximas.map((f) => ({ f, vencida: false })), ...semana.vencidas.map((f) => ({ f, vencida: true }))]
              .slice(0, 10)
              .map(({ f, vencida }) => (
                <li key={f.clave} className="border-t border-border first:border-t-0">
                  <button
                    type="button"
                    onClick={() => f.pedido && onAbrirPedido(f.pedido, f.of)}
                    className="grid w-full grid-cols-[5.5rem_4.5rem_6.5rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-1 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--hero-relleno)] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <span
                      className={`rounded-lg px-2 py-0.5 text-center font-bold tabular-nums ${
                        vencida ? "bg-red-500/12 text-red-800 dark:text-red-300" : "bg-teal-500/12 text-teal-800 dark:text-teal-300"
                      }`}
                    >
                      {fechaCorta(String(f.fechaComprometida))}
                    </span>
                    <span className="font-mono font-semibold">{f.of}</span>
                    <span className="font-semibold tabular-nums">{f.pedido}</span>
                    <span className="truncate text-text-muted">{f.cliente}</span>
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                        f.bultosSubidos === "SI"
                          ? "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300"
                          : "bg-red-500/12 text-red-800 dark:text-red-300"
                      }`}
                    >
                      {f.bultosSubidos === "SI" ? "Bultos subidos" : vencida ? "Pasada, sin subir" : "Sin subir"}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
          {semana.antiguas > 0 && (
            <button
              type="button"
              onClick={() => onAbrirLista("fechas-comprometidas")}
              className="mt-1.5 w-full rounded-xl bg-red-500/8 px-3 py-1.5 text-left text-[12.5px] font-semibold text-red-800 transition-colors hover:bg-red-500/12 dark:text-red-200"
            >
              Y {semana.antiguas} más antiguas que pasaron sin subir los bultos → ver en la lista
            </button>
          )}
          </>
        )}
      </section>
    </div>
  );
}
