"use client";

import type { Operario, Rol } from "@/lib/types";
import { agruparPorFase, conTope, pedidoParado } from "@/lib/fases-tablero";
import type { Seccion } from "@/lib/secciones";
import type { Facet } from "./PedidoCard";
import type { LiveInfo } from "./Board";
import { PedidoLinea } from "./PedidoLinea";
import { LiveDot } from "./LiveBadge";
import { ROL } from "@/lib/estado";
import { tintaSobre } from "@/lib/tinta";

/** Cuántos pedidos se ven por fase antes de "+N más". Es lo que garantiza que
 *  el bloque mida lo mismo con 5 pedidos que con 40.
 *
 *  Seis y no tres: con tres, un reparto normal ya mandaba media columna al
 *  desplegable, y abrir un panel para ver el cuarto pedido es trabajo que no
 *  hacía falta. Cada fila mide 26 px, así que seis siguen cabiendo sin que la
 *  zona personal se coma la bandeja. */
const TOPE = 6;

/** La zona del operario actual. Solo pinta las fases CON contenido: una fase
 *  vacía no gasta una columna (eran ~270 px para no decir nada) y tampoco un
 *  contador a cero en la cabecera, que es lo que llevaba hasta ahora. La
 *  leyenda del equipo, justo debajo, ya nombra las fases con su color. */
export function ZonaPersonal({
  operario,
  facets,
  seccion,
  live,
  onOpen,
  onVerTodos,
  onFichar,
  onDesficharVarias,
  completarPedido,
  operarios,
  ofIdsFichandoYo,
}: {
  operario: Operario;
  facets: Facet[];
  /** De qué sección es lo que se está pintando. De ella sale el ORDEN de las
   *  columnas (ver `ordenFases` en lib/secciones.ts). */
  seccion: Seccion;
  live?: LiveInfo | null;
  onOpen: (f: Facet) => void;
  /** Saca el pedido a Producción (columna "Listo para pasar"). */
  completarPedido: (pedidoId: string) => void;
  /** Abre el desplegable con todos los pedidos de una fase. */
  onVerTodos: (faseId: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  /** Para el reloj en varias OF a la vez; lo usa la pausa por pedido de
   *  PedidoLinea (ver desficharVarias en Board). */
  onDesficharVarias: (ofIds: string[]) => void;
  /** Para poner nombre a quien falta en "listo para pasar" (ver PedidoLinea). */
  operarios: Operario[];
  /** OFs de mi intervalo abierto; ver el comentario en Board. */
  ofIdsFichandoYo?: ReadonlySet<string>;
}) {
  const grupos = agruparPorFase(facets, seccion);
  // Los parados por Producción se quedan en LA COLUMNA QUE TENÍAN (ver
  // faseDeColumna), con su «Detenido» al lado. Salían de las columnas y se
  // resumían aquí arriba: no había nada que hacer con ellos, pero así
  // desaparecían de la vista de quien los tenía y volvían semanas después sin
  // que nadie se acordara. La cuenta de la cabecera se queda, que es lo que
  // avisa de que hay trabajo tuyo parado en otras manos.
  const parados = facets.filter(pedidoParado);
  const deTrabajo = grupos.filter((g) => g.id !== "parado");
  // Las fases VACÍAS no se enseñan: llevaban su contador a cero en la
  // cabecera («0 a corregir · 0 planteando · …») y decían dos veces lo mismo,
  // porque la leyenda del equipo, justo debajo, ya nombra las fases con su
  // color. Un cero no es una noticia.
  const conItems = deTrabajo.filter((g) => g.items.length > 0);
  const nOFs = facets.reduce((n, f) => n + f.ofs.length, 0);

  return (
    <div
      style={{ borderColor: operario.color }}
      className="glass-panel flex flex-col rounded-2xl border p-3"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className="grid size-7 place-items-center rounded-full text-[11px] font-bold text-white"
          style={{ background: operario.color, color: tintaSobre(operario.color) }}
        >
          {operario.iniciales}
        </span>
        <h2 className="text-sm font-semibold text-text">{operario.nombre}</h2>
        <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-800 dark:text-brand-300">
          Tú
        </span>
        <span className="text-[11px] text-text-muted">
          {facets.length} pedido{facets.length === 1 ? "" : "s"} · {nOFs} OF
        </span>

        {/* Cuántos hay parados, y nada más. NO abre lista: los pedidos están
            en su columna con su «Detenido», así que un panel que los repitiera
            enseñaría lo mismo dos veces. Esto solo avisa de que parte de tu
            trabajo está en manos de Producción y no avanza. */}
        {parados.length > 0 && (
          <span
            title="Producción los tiene detenidos: no se pueden fichar ni dar por terminados. Están en su columna, marcados como «Detenido», y se liberan solos."
            className="flex items-center gap-1.5 rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-600/25 dark:text-amber-300"
          >
            <span className="size-1.5 rounded-full bg-amber-500" />
            {parados.length} parado{parados.length === 1 ? "" : "s"} por Producción
          </span>
        )}

        {live && (
          <span
            className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold"
            style={{ color: ROL[live.rol].color }}
          >
            <LiveDot rol={live.rol} className="size-1.5" />
            {ROL[live.rol].label} {live.pedido.codigo}
          </span>
        )}
      </div>

      {conItems.length === 0 ? (
        <p className="py-2 text-[11px] text-text-muted">Sin pedidos asignados.</p>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          {conItems.map((g) => {
            const { visibles, resto } = conTope(g.items, TOPE);
            return (
              <div key={g.id} className="min-w-[220px] flex-1">
                <h3 className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-text-muted">
                  <span className="size-1.5 rounded-full" style={{ background: g.color }} />
                  {g.label} · {g.items.length}
                </h3>
                <div className="flex flex-col gap-1">
                  {visibles.map((f) => (
                    <PedidoLinea
                      key={f.pedido.id}
                      facet={f}
                      fase={g.id}
                      onOpen={onOpen}
                      onFichar={onFichar}
                      onDesficharVarias={onDesficharVarias}
                      completarPedido={completarPedido}
                      operarios={operarios}
                      ofIdsFichandoYo={ofIdsFichandoYo}
                    />
                  ))}
                  {resto > 0 && (
                    <button
                      onClick={() => onVerTodos(g.id)}
                      className="rounded-md border border-dashed border-[var(--glass-border)] py-0.5 text-[10px] font-semibold text-text-muted hover:border-brand-400 hover:text-text"
                    >
                      +{resto} más
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
