"use client";

import type { OF, Rol } from "@/lib/types";
import type { Facet } from "./PedidoCard";
import { FASES, type Fase } from "@/lib/fases-tablero";
import { accionPrimariaDePedido, ofsFichablesDe, ofsPara } from "@/lib/accion-pedido";
import { fmtMin } from "@/lib/estado";
import type { AccionOF } from "@/lib/acciones";

/** Una línea por pedido: código, cliente, descripción y nº de OF. El detalle
 *  largo sale al abrir el pedido; aquí manda que quepan muchos sin crecer.
 *
 *  Las acciones se revelan al pasar el ratón para no gastar sitio en reposo.
 *  Dos excepciones quedan siempre visibles: la pausa del pedido que se está
 *  fichando (es la que más se pulsa, esconderla obligaría a buscarla) y el
 *  botón «Pasar» en "listo para pasar" (es la acción esperada de esa fase).
 *
 *  El borde izquierdo lleva el color de la fase, salvo en urgentes, que lo
 *  pintan en rojo: la prioridad tiene que verse sin leer. */
export function PedidoLinea({
  facet,
  fase,
  onOpen,
  onAccion,
  onFichar,
  onDesfichar,
  completarPedido,
  soloConsulta = false,
  arrastrable = false,
}: {
  facet: Facet;
  fase: Fase;
  onOpen: (f: Facet) => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  completarPedido: (pedidoId: string) => void;
  /** Panel de un compañero: sobre su trabajo no se ficha ni se cambia estado. */
  soloConsulta?: boolean;
  /** Solo en modo consulta: si se puede quitar al compañero (arrastrándolo). */
  arrastrable?: boolean;
}) {
  const { pedido, ofs } = facet;
  const urgente = pedido.prioridad === 3;
  const fichando = ofs.find((o) => o.fichandoRol);
  const minutos = ofs.reduce((n, o) => n + o.tiempoPlanteoMin + o.tiempoRevisionMin, 0);
  const color = urgente ? "#dc2626" : FASES.find((f) => f.id === fase)?.color;
  const descripcion = ofs[0]?.descripcion ?? "";

  const accion = accionPrimariaDePedido(facet);
  // El motor de fichaje solo admite un rol corriendo a la vez (ver el
  // comentario de ofsFichablesDe): en "esperandoRevision" lo que se ficha es
  // la revisión; en el resto de fases (planteando, sinEmpezar) es el
  // planteo. Las OFs del otro rol que también sean fichables (un pedido
  // "planteando" puede tener a la vez una OF en_curso y otra por_revisar) se
  // fichan desde el detalle, una a una — igual que resuelve PedidoChip.
  const rolFichar: Rol = fase === "esperandoRevision" ? "revisar" : "plantear";
  const fichables = ofsFichablesDe(facet, rolFichar);

  return (
    <div
      style={{ borderLeftColor: color }}
      className={`group flex items-center gap-2 rounded-lg border border-l-[3px] border-[var(--glass-border)] px-2 py-1 text-[11px] transition-colors hover:border-brand-400 ${
        fichando ? "bg-emerald-500/10" : "bg-surface-2/60"
      }`}
    >
      <button
        onClick={() => onOpen(facet)}
        title={`${pedido.codigo} · ${pedido.cliente} · ${descripcion}`}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        {fichando && (
          <span className="size-1.5 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30" />
        )}
        <b className="shrink-0 font-semibold tabular-nums text-text">{pedido.codigo}</b>
        <span className="min-w-0 flex-1 truncate text-text-muted">
          {pedido.cliente}
          {descripcion && ` · ${descripcion}`}
        </span>
        <span className="shrink-0 text-[10px] text-text-muted">
          {ofs.length} OF{minutos > 0 && ` · ${fmtMin(minutos)}`}
        </span>
      </button>

      {/* Trabajo de otro: ni se ficha ni se cambia de estado. Lo que se puede
          es quitárselo, y solo si no lo ha empezado — mover un pedido con
          tiempo ya fichado dejaría las horas a nombre de uno y el trabajo a
          nombre de otro. El motivo va escrito para que no haya que adivinarlo. */}
      {soloConsulta ? (
        <span className="shrink-0 text-[10px] text-text-muted">
          {arrastrable ? (
            <span className="rounded border border-dashed border-amber-500/70 px-1.5 py-0.5 font-semibold text-amber-600">
              Arrastrable
            </span>
          ) : (
            <span title={motivoBloqueo(facet, fichando)}>🔒 {motivoBloqueo(facet, fichando)}</span>
          )}
        </span>
      ) : (
      <span className="flex shrink-0 items-center gap-1">
        {/* Pausa: siempre visible mientras se ficha. */}
        {fichando ? (
          <button
            onClick={() => onDesfichar(fichando.id)}
            title="Pausar el fichaje"
            className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700"
          >
            Pausar
          </button>
        ) : (
          fichables.length > 0 && (
            <button
              onClick={() => onFichar(fichables.map((o) => o.id), rolFichar)}
              title="Empezar a fichar en este pedido"
              className="rounded px-1.5 py-0.5 text-[10px] font-bold text-text-muted opacity-0 transition-opacity hover:bg-[var(--glass-highlight)] hover:text-text focus:opacity-100 group-hover:opacity-100"
            >
              Fichar
            </button>
          )
        )}

        {accion && (
          <button
            onClick={() => onAccion(ofsPara(facet, accion.id).map((o) => o.id), accion.id)}
            title={accion.label}
            className="rounded bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold text-white opacity-0 transition-opacity hover:bg-brand-600 focus:opacity-100 group-hover:opacity-100"
          >
            {accion.label}
          </button>
        )}

        {fase === "listoParaPasar" && (
          <button
            onClick={() => completarPedido(pedido.id)}
            title="Pasar el pedido a Producción"
            className="rounded bg-cyan-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-cyan-700"
          >
            Pasar
          </button>
        )}
      </span>
      )}
    </div>
  );
}

/** Por qué no se puede quitar este pedido a quien lo tiene. */
function motivoBloqueo(facet: Facet, fichando: OF | undefined): string {
  if (fichando) return "fichando ahora";
  const minutos = facet.ofs.reduce((n, o) => n + o.tiempoPlanteoMin + o.tiempoRevisionMin, 0);
  if (minutos > 0) return `${fmtMin(minutos)} fichados`;
  const revisor = facet.ofs.find((o) => o.revisorId)?.revisorId;
  if (revisor) return "ya tiene revisor";
  return "empezado";
}
