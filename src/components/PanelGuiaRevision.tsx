"use client";

import { GUIA_REVISION } from "@/lib/guia-revision";
import { PanelFlotante, BotonCerrarPanel } from "./PanelFlotante";

/** La guía de revisión, para leerla en frío.
 *
 *  La de la tarjeta se usa CON una OF delante, marcando. Esta es la misma lista
 *  sin casillas: para consultarla cuando no estás revisando y, sobre todo, para
 *  enseñársela a quien empieza. Hasta hoy esto vivía en la cabeza de Ángel y en
 *  un mensaje de chat.
 *
 *  Cada punto lleva debajo lo que se marca si falla, que es de donde salen las
 *  causas de devolución: son la misma lista por las dos caras, y verlas juntas
 *  ahorra la pregunta de por qué al devolver aparecen escritas del revés. */
export function PanelGuiaRevision({ onCerrar }: { onCerrar: () => void }) {
  return (
    <PanelFlotante titulo="Qué mirar al revisar" onCerrar={onCerrar}>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-bold text-text">Qué mirar al revisar</h3>
        <BotonCerrarPanel className="ml-auto" />
      </div>

      <p className="mb-3 text-[11px] leading-snug text-text-muted">
        Los puntos que se repasan en una lona antes de darla por buena. Mientras
        revisas los tienes en la propia tarjeta, y lo que marques como fallo llega
        marcado al cuadro de devolver.
      </p>

      <ol className="flex flex-col gap-2">
        {GUIA_REVISION.map((p) => (
          <li key={p.id} className="border-l-2 border-border pl-2">
            <span className="block text-xs font-semibold text-text">{p.mira}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-text-muted">
              Si falla: {p.causa.toLowerCase()}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-3 border-t border-border pt-2 text-[11px] leading-snug text-text-muted">
        Son los de lona. Para otros trabajos hará falta mirar más cosas: lo que no
        esté aquí se escribe como causa nueva al devolver, y queda para todos.
      </p>
    </PanelFlotante>
  );
}
