"use client";

import { useEffect, useRef, useState } from "react";
import type { Operario } from "@/lib/types";
import { ROL } from "@/lib/estado";
import { OpDot } from "./Select";

/** Las mismas opciones y el mismo orden que el selector anterior. Compartir
 *  los botones evita que cambiar revisor conserve un desplegable distinto. */
export function BotonesRevisor({
  operarios, excluirIds, valorActual = null, onElegir,
  deshabilitado = false, enfocarAlMontar = false, miId,
}: {
  operarios: Operario[];
  excluirIds: (string | null)[];
  valorActual?: string | null;
  onElegir: (id: string) => void;
  deshabilitado?: boolean;
  enfocarAlMontar?: boolean;
  miId?: string | null;
}) {
  const grupo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enfocarAlMontar) return;
    // El disparador desaparece al elegir revisor: el foco entra en el nombre
    // que ya estaba puesto, o en el primero, para poder continuar con teclado.
    const boton = grupo.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      ?? grupo.current?.querySelector<HTMLButtonElement>("button");
    boton?.focus();
  }, [enfocarAlMontar]);
  const excluidos = new Set(excluirIds.filter(Boolean));
  const elegibles = operarios.filter((o) => !excluidos.has(o.id));
  return (
    <div ref={grupo} role="group" aria-label="Compañeros que pueden revisar" className="flex flex-wrap items-center gap-1.5">
      {elegibles.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-label={`Elegir a ${o.nombre} como revisor`}
          aria-pressed={o.id === valorActual}
          disabled={deshabilitado}
          onClick={() => onElegir(o.id)}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-semibold hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:cursor-wait disabled:opacity-60 ${o.id === valorActual ? ROL.revisar.chip : "bg-surface-2 text-text"}`}
          style={o.id === valorActual ? { borderColor: ROL.revisar.color } : undefined}
        >
          <OpDot color={o.color} iniciales={o.iniciales} />
          {o.nombre}{o.id === miId ? " (tú)" : ""}
        </button>
      ))}
      {elegibles.length === 0 && <span className="text-xs text-text-muted">No hay compañeros disponibles para revisar.</span>}
    </div>
  );
}

/** Selector inline de revisor que acompaña a "Pasar a revisión": el revisor
 *  se nombra en el momento de pasar la OF, no con un botón suelto. Mismo
 *  componente en el bloque del pedido y en cada OF del Drawer para que el
 *  flujo sea idéntico en ambos casos. El autor nunca puede ser el revisor.
 *
 *  ELEGIR ES MANDAR. Antes eran tres pasos —pulsar "Pasar a revisión", elegir
 *  y confirmar— y el tercero se olvidaba: Alberto pulsaba, daba la OF por
 *  mandada y se iba, y minutos después seguía en su mesa (23/09/2026). Ahora
 *  los compañeros salen directamente como botones y pulsar un nombre la manda.
 *  Si se abandona sin elegir —se cierra la ficha, se pliega la OF—,
 *  `onAbandonado` lo cuenta para
 *  que el tablero avise en el momento y no minutos después. */
export function PedirRevisor({
  operarios,
  excluirIds,
  valorInicial = null,
  onConfirmar,
  onCancelar,
  onAbandonado,
}: {
  operarios: Operario[];
  /** Ids que no pueden revisar (autores de las OFs afectadas). */
  excluirIds: (string | null)[];
  /** Revisor ya asignado, si lo hay (p.ej. una devuelta que vuelve a revisión). */
  valorInicial?: string | null;
  onConfirmar: (revisorId: string) => void | Promise<void>;
  onCancelar: () => void;
  /** Se ha ido sin elegir ni cancelar. */
  onAbandonado?: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const enVuelo = useRef(false);

  // Si al desmontarse no se eligió ni se canceló, es que se ha abandonado. El
  // aviso va en un timeout que el siguiente montaje cancela: en desarrollo
  // React monta, desmonta y vuelve a montar, y eso no es abandonar nada.
  const resuelto = useRef(false);
  const abandonado = useRef(onAbandonado);
  useEffect(() => {
    abandonado.current = onAbandonado;
  });
  const pendiente = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(pendiente.current);
    return () => {
      if (resuelto.current) return;
      pendiente.current = setTimeout(() => abandonado.current?.(), 0);
    };
  }, []);

  async function elegir(id: string) {
    if (enVuelo.current) return;
    enVuelo.current = true;
    resuelto.current = true;
    setGuardando(true);
    try { await onConfirmar(id); }
    finally { enVuelo.current = false; setGuardando(false); }
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2" aria-busy={guardando} onClick={(e) => e.stopPropagation()}>
      <span className="text-[10px] text-text-muted">Revisor:</span>
      <BotonesRevisor operarios={operarios} excluirIds={excluirIds} valorActual={valorInicial}
        onElegir={(id) => void elegir(id)} deshabilitado={guardando} enfocarAlMontar />
      {guardando && <span role="status" className="text-xs text-text-muted">Guardando…</span>}
      <button
        type="button"
        aria-label="Cancelar elección de revisor"
        disabled={guardando}
        onClick={() => {
          resuelto.current = true;
          onCancelar();
        }}
        className="rounded bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-text hover:bg-[var(--glass-highlight)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
      >
        Cancelar
      </button>
    </div>
  );
}
