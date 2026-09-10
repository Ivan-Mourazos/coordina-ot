"use client";

import type { Operario, Rol } from "@/lib/types";
import { agruparPorFase } from "@/lib/fases-tablero";
import type { Seccion } from "@/lib/secciones";
import type { Facet } from "./PedidoCard";
import { PedidoLinea } from "./PedidoLinea";
import { BotonCerrarPanel, PanelFlotante } from "./PanelFlotante";

/** Todos los pedidos de una fase, para cuando el tope de la zona personal deja
 *  algunos fuera. El comportamiento (sitio, fondo, cierre) lo pone
 *  PanelFlotante, compartido con el panel de compañero. */
export function FaseFlyout({
  facets,
  seccion,
  faseId,
  onOpen,
  onClose,
  onFichar,
  onDesficharVarias,
  completarPedido,
  operarios,
  ofIdsFichandoYo,
}: {
  facets: Facet[];
  /** De qué sección es lo que se está pintando. De ella sale el ORDEN de las
   *  columnas (ver `ordenFases` en lib/secciones.ts). */
  seccion: Seccion;
  faseId: string;
  onOpen: (f: Facet) => void;
  onClose: () => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  /** Para el reloj en varias OF a la vez; lo usa la pausa por pedido de
   *  PedidoLinea (ver desficharVarias en Board). */
  onDesficharVarias: (ofIds: string[]) => void;
  completarPedido: (pedidoId: string) => void;
  /** Para poner nombre a quien falta en "listo para pasar" (ver PedidoLinea). */
  operarios: Operario[];
  /** OFs de mi intervalo abierto; ver el comentario en Board. */
  ofIdsFichandoYo?: ReadonlySet<string>;
}) {
  // `seccion` solo entra aquí porque `agruparPorFase` la pide para saber el
  // ORDEN de las columnas (ver su comentario arriba); pero este panel enseña
  // UN grupo suelto —el que hace `.find` a continuación—, no la lista entera
  // ordenada. El orden no llega a pintarse nunca: no busques aquí el efecto
  // de `seccion` que sí tienen los otros sitios que agrupan por fase.
  const grupo = agruparPorFase(facets, seccion).find((g) => g.id === faseId);
  if (!grupo) return null;

  return (
    <PanelFlotante titulo={grupo.label} onCerrar={onClose}>
      <div className="mb-2 flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: grupo.color }} />
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
          {grupo.label} · {grupo.items.length}
        </h3>
        {/* Del contexto y no del `onClose` de arriba: ese desmonta el panel en
            seco y se saltaría la animación de salida. */}
        <BotonCerrarPanel className="ml-auto" />
      </div>
      <div className="flex flex-col gap-1">
        {grupo.items.map((f) => (
          <PedidoLinea
            key={f.pedido.id}
            facet={f}
            fase={grupo.id}
            onOpen={onOpen}
            onFichar={onFichar}
            onDesficharVarias={onDesficharVarias}
            completarPedido={completarPedido}
            operarios={operarios}
            ofIdsFichandoYo={ofIdsFichandoYo}
          />
        ))}
      </div>
    </PanelFlotante>
  );
}
