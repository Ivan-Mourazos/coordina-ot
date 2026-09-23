"use client";

import { useEffect, useRef } from "react";
import type { Operario } from "@/lib/types";
import { Select, OpDot } from "./Select";

/** Selector inline de revisor que acompaña a "Pasar a revisión": el revisor
 *  se nombra en el momento de pasar la OF, no con un botón suelto. Mismo
 *  componente en el chip del tablero y en el Drawer para que el flujo sea
 *  idéntico en todas partes. El autor nunca puede ser el revisor.
 *
 *  ELEGIR ES MANDAR. Antes eran tres pasos —pulsar "Pasar a revisión", elegir
 *  y confirmar— y el tercero se olvidaba: Alberto pulsaba, daba la OF por
 *  mandada y se iba, y minutos después seguía en su mesa (23/09/2026). Ahora
 *  la lista sale ya abierta y pulsar un nombre la manda. Si se abandona sin
 *  elegir —se cierra la ficha, se pliega la OF—, `onAbandonado` lo cuenta para
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
  onConfirmar: (revisorId: string) => void;
  onCancelar: () => void;
  /** Se ha ido sin elegir ni cancelar. */
  onAbandonado?: () => void;
}) {
  const excluidos = new Set(excluirIds.filter(Boolean) as string[]);

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

  return (
    <div className="flex w-full items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <span className="text-[10px] text-text-muted">Revisor:</span>
      <div className="flex-1">
        <Select
          value={valorInicial}
          abiertoAlMontar
          onChange={(v) => {
            if (!v) return;
            resuelto.current = true;
            onConfirmar(v);
          }}
          options={operarios
            .filter((o) => !excluidos.has(o.id))
            .map((o) => ({
              value: o.id,
              label: o.nombre,
              icon: <OpDot color={o.color} iniciales={o.iniciales} />,
            }))}
          placeholder={null}
        />
      </div>
      <button
        onClick={() => {
          resuelto.current = true;
          onCancelar();
        }}
        className="rounded bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-text hover:bg-[var(--glass-highlight)]"
      >
        Cancelar
      </button>
    </div>
  );
}
