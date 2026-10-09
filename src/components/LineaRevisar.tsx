"use client";

import type { Operario, Pedido, Rol } from "@/lib/types";
import type { FacetRevision } from "@/lib/revision";
import { accionesDisponibles } from "@/lib/acciones";
import { ofsFichablesDe } from "@/lib/accion-pedido";
import { ROL } from "@/lib/estado";
import { tintaSobre } from "@/lib/tinta";
import { FamiliaTag } from "./FamiliaTag";
import { useSoloLectura } from "./SoloLectura";

/** Una línea por pedido que me toca REVISAR, en la zona personal del Panel.
 *
 *  Es la hermana de `PedidoLinea`, y va aparte a propósito: aquella es MI
 *  trabajo como autor (fichar el planteo, pasar a Producción) y esta es el de
 *  un compañero en mis manos. Meterla allí habría sido una fase más con todas
 *  sus reglas al revés.
 *
 *  Como allí, UN botón al final y revelado al pasar el ratón: empezar la
 *  revisión o reanudarla. Fija solo la pausa de lo que estoy fichando. Aprobar
 *  y devolver NO están aquí: piden repasar la guía punto por punto, y eso se
 *  hace en la pestaña Revisiones o dentro del pedido.
 *
 *  Lleva el avatar del AUTOR: es lo que la distingue de "Esperando revisión",
 *  que es del mismo violeta pero al revés — lo mío en manos de otro. */
export function LineaRevisar({
  facet,
  miId,
  operarios,
  onOpen,
  onEmpezar,
  onFichar,
  onDesficharVarias,
  ofIdsFichandoYo,
}: {
  facet: FacetRevision;
  miId: string;
  operarios: Operario[];
  onOpen: (p: Pedido) => void;
  /** Pasa las OF a "en revisión" y arranca mi reloj de revisor. */
  onEmpezar: (ofIds: string[]) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesficharVarias: (ofIds: string[]) => void;
  /** OFs de MI intervalo abierto; ver el comentario en Board. */
  ofIdsFichandoYo?: ReadonlySet<string>;
}) {
  const soloLectura = useSoloLectura();
  const { pedido, ofs } = facet;
  const urgente = pedido.prioridad === 3;
  const fichandoYo = ofs.filter((o) => ofIdsFichandoYo?.has(o.id));
  // Es la máquina de estados la que dice si puedo empezar (ver `soloEl` en
  // lib/acciones.ts), no esta fila.
  const porEmpezar = ofs.filter((o) =>
    accionesDisponibles(o, miId).some((a) => a.id === "empezar_revision"),
  );
  // Las que ya estoy revisando y tienen el reloj parado.
  const reanudables = ofsFichablesDe(facet, "revisar").filter((o) => o.estado === "en_revision");
  const revisando = ofs.some((o) => o.estado === "en_revision");
  const familias = [...new Set(ofs.map((o) => o.familia))];
  const autores = [...new Set(ofs.map((o) => o.autorId))]
    .map((id) => operarios.find((o) => o.id === id))
    .filter((o): o is Operario => o !== undefined);

  return (
    <div
      style={{ borderLeftColor: urgente ? "#dc2626" : ROL.revisar.color }}
      className={`group relative flex items-center gap-2 rounded-lg border border-l-[3px] border-[var(--glass-border)] px-2 py-1.5 text-[11px] transition-colors hover:border-brand-400 ${
        fichandoYo.length > 0 ? "bg-violet-500/10" : "bg-surface-2/60"
      }`}
    >
      <button
        onClick={() => onOpen(pedido)}
        className="grid min-w-0 flex-1 cursor-pointer grid-cols-[5.75rem_6.5rem_minmax(0,26rem)_auto] items-center justify-start gap-1.5 overflow-hidden text-left"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {fichandoYo.length > 0 && (
            <span
              title="Lo estás revisando tú"
              className="size-1.5 shrink-0 rounded-full bg-violet-500 ring-2 ring-violet-500/30"
            />
          )}
          <b className="truncate font-semibold tabular-nums text-text">{pedido.codigo}</b>
        </span>
        <span className="flex min-w-0 items-center gap-1">
          {familias[0] && <FamiliaTag familia={familias[0]} />}
          {familias.length > 1 && (
            <span className="shrink-0 text-[10px] text-text-muted" title={familias.join(" · ")}>
              +{familias.length - 1}
            </span>
          )}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          {autores.slice(0, 2).map((op) => (
            <span
              key={op.id}
              title={`Lo plantea ${op.nombre}`}
              className="grid size-4 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
              style={{ background: op.color, color: tintaSobre(op.color) }}
            >
              {op.iniciales}
            </span>
          ))}
          <span className="min-w-0 flex-1 truncate text-text-muted">{pedido.cliente}</span>
        </span>
        {/* Se esconde cuando aparece el botón encima, igual que en PedidoLinea:
            el fondo de la fila es translúcido y el texto se vería a través. */}
        <span
          className={`flex shrink-0 items-center justify-end gap-2 text-[10px] ${
            fichandoYo.length > 0 ? "invisible" : "group-hover:invisible"
          }`}
        >
          <span className={revisando ? `font-semibold ${ROL.revisar.texto}` : "text-text-muted"}>
            {revisando ? "Revisando" : "Por empezar"}
          </span>
          <span className="w-[2.25rem] shrink-0 text-right text-text-muted">{ofs.length} OF</span>
        </span>
      </button>

      <span
        className={`pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 rounded-r-lg pl-4 [&>*]:pointer-events-auto ${
          fichandoYo.length > 0 ? "bg-inherit" : "group-hover:bg-inherit"
        }`}
      >
        {soloLectura ? null : fichandoYo.length > 0 ? (
          <button
            onClick={() => onDesficharVarias(fichandoYo.map((o) => o.id))}
            title="Para el reloj y deja la revisión como está: sigue siendo tuya"
            className={`boton-3d rounded-md px-2 py-0.5 text-[11px] font-semibold ${ROL.revisar.solido}`}
          >
            ⏸ Pausar{fichandoYo.length > 1 && ` ${fichandoYo.length}`}
          </button>
        ) : porEmpezar.length > 0 ? (
          <button
            onClick={() => onEmpezar(porEmpezar.map((o) => o.id))}
            title="Pasa a En revisión y arranca tu fichaje de revisor"
            className={`boton-3d rounded-md px-2 py-0.5 text-[11px] font-semibold opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 ${ROL.revisar.solido}`}
          >
            Empezar revisión
          </button>
        ) : (
          reanudables.length > 0 && (
            <button
              onClick={() => onFichar(reanudables.map((o) => o.id), "revisar")}
              title="Vuelve a poner el reloj en marcha en esta revisión"
              className={`boton-3d rounded-md px-2 py-0.5 text-[11px] font-semibold opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 ${ROL.revisar.solido}`}
            >
              ▶ Reanudar
            </button>
          )
        )}
      </span>
    </div>
  );
}
