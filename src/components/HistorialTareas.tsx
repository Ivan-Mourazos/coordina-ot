"use client";

import { useId, useState } from "react";
import type { HistorialOF } from "@/lib/historial";
import type { SeccionId } from "@/lib/secciones";
import { fmtMin } from "@/lib/estado";
import { agruparCentros } from "@/lib/historial-centros";

export function HistorialTareas({ ofs, seccion }: { ofs: HistorialOF[]; seccion: SeccionId }) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" popoverTarget={id} aria-expanded={abierto} aria-controls={id} className="mb-2 rounded-md border border-border px-2 py-1 text-xs font-semibold text-text hover:bg-surface-2">Tareas y tiempos</button>
      <div id={id} popover="auto" data-historial-extra="" onToggle={(e) => setAbierto(e.newState === "open")}
        onKeyDown={(e) => { if (e.key === "Escape") e.stopPropagation(); }}
        className="m-auto max-h-[75vh] w-[min(680px,92vw)] overflow-y-auto rounded-xl border border-border bg-surface p-4 text-text shadow-xl backdrop:bg-black/30">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Tareas y tiempos del pedido</h3>
          <button type="button" popoverTarget={id} popoverTargetAction="hide" className="rounded px-2 py-1 text-xs hover:bg-surface-2">Cerrar</button>
        </div>
        <p className="mb-3 text-xs text-text-muted">Tiempos de RPS. Desglose por persona en la sección seleccionada.</p>
        {agruparCentros(ofs).filter((centro) => centro.ofs.length).map((centro) => (
          <section key={centro.id} className="mb-4 last:mb-0">
            <h4 className="mb-2 flex justify-between text-sm font-semibold"><span>{centro.nombre}</span><span>{fmtMin(centro.totalMin)}</span></h4>
            {centro.ofs.map((of) => (
              <div key={of.codigo} className="mb-2 border-t border-border pt-2 text-xs">
                <p className="mb-1 font-semibold">{of.codigo} · {of.descripcion}</p>
                {of.tareas?.length ? of.tareas.map((tarea) => (
                  <div key={tarea.codigo} className="py-1">
                    <p className="flex justify-between gap-3"><span>{tarea.codigo} · {tarea.descripcion}</span><span className="shrink-0 font-semibold">{fmtMin(tarea.tiempoImputadoMin)}</span></p>
                    {centro.id === seccion && tarea.personas.map((p) => <p key={p.nombre} className="ml-3 flex justify-between gap-3 text-text-muted"><span>{p.nombre}</span><span>{fmtMin(p.min)}</span></p>)}
                  </div>
                )) : <p className="text-text-muted">Sin desglose de tareas disponible.</p>}
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
