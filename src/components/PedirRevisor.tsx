"use client";

import { useEffect, useRef, useState } from "react";
import type { Operario } from "@/lib/types";
import { ROL } from "@/lib/estado";
import { OpDot } from "./Select";

/** Las mismas opciones y el mismo orden que el selector anterior. Compartir
 *  los botones evita que cambiar revisor conserve un desplegable distinto. */
export function BotonesRevisor({
  operarios, excluirIds, valorActual = null, onElegir,
  deshabilitado = false, enfocarAlMontar = false, miId, nombreCorto = false, onQuitar,
}: {
  /** Pulsar el nombre ya elegido lo quita. Sin esto, no hace nada. */
  onQuitar?: () => void;
  /** Solo el nombre de pila: en la fila del tablero no caben los completos. */
  nombreCorto?: boolean;
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
    // Siempre `flex-wrap`, también con `nombreCorto`: antes `flex-nowrap` junto
    // al `overflow-x-auto` de PedidoLinea sacaba barra de scroll horizontal en
    // las columnas estrechas del tablero. Si caben, van en una línea; si no,
    // saltan de línea dentro de la fila.
    <div ref={grupo} role="group" aria-label="Compañeros que pueden revisar" className="flex min-w-0 flex-wrap items-center gap-1">
      {elegibles.map((o) => {
        const quitable = !!onQuitar && o.id === valorActual;
        return (
        <button
          key={o.id}
          type="button"
          aria-label={quitable ? `Quitar a ${o.nombre} de revisor` : `Elegir a ${o.nombre} como revisor`}
          title={quitable ? `Quitar a ${o.nombre}: la OF vuelve a planteando` : undefined}
          aria-pressed={o.id === valorActual}
          disabled={deshabilitado}
          onClick={() => (quitable ? onQuitar?.() : onElegir(o.id))}
          className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border border-border pl-0.5 pr-2 text-[11px] font-semibold hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-[-2px]! focus-visible:outline-current disabled:cursor-wait disabled:opacity-60 ${o.id === valorActual ? ROL.revisar.chip : "bg-surface-2 text-text"}`}
          style={o.id === valorActual ? { borderColor: ROL.revisar.color } : undefined}
        >
          <OpDot color={o.color} iniciales={o.iniciales} />
          {nombreCorto ? o.nombre.split(" ")[0] : o.nombre}{o.id === miId ? " (tú)" : ""}
          {quitable && <span aria-hidden="true" className="-mr-0.5 opacity-70">×</span>}
        </button>
        );
      })}
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
  nombreCorto = false,
}: {
  /** Solo el nombre de pila (la fila del tablero). */
  nombreCorto?: boolean;
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
    // EN LA LÍNEA DE LOS BOTONES, en su lugar (Iván, 26/11/2026): si todos los
    // compañeros caben en una línea, la fila no crece; si la columna es estrecha,
    // `BotonesRevisor` salta de línea y la flecha queda arriba a la izquierda,
    // sin scroll horizontal.
    <div className="flex min-w-0 items-start gap-1" aria-busy={guardando} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label="Volver sin elegir revisor"
        title="Volver sin elegir revisor"
        disabled={guardando}
        onClick={() => {
          resuelto.current = true;
          onCancelar();
        }}
        className="chip-3d inline-flex size-6 shrink-0 items-center justify-center rounded-full text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px]! disabled:cursor-wait disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {/* Sin «Revisor:» delante: sale al pulsar «Pasar a revisión», ya se sabe
          qué son estos nombres. Y SIN foco puesto al abrir: el primer nombre
          salía con el contorno del foco y parecía elegido (Iván, 26/11/2026).
          Solo los nombres; se pulsa uno y se cierra. */}
      <BotonesRevisor operarios={operarios} excluirIds={excluirIds} valorActual={valorInicial}
        onElegir={(id) => void elegir(id)} deshabilitado={guardando} nombreCorto={nombreCorto} />
      {guardando && <span role="status" className="shrink-0 text-xs leading-6 text-text-muted">Guardando…</span>}
    </div>
  );
}
