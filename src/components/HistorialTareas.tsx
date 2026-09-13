"use client";

import { useId, useState } from "react";
import type { HistorialOF } from "@/lib/historial";
import { porMinutos } from "@/lib/historial";
import type { SeccionId } from "@/lib/secciones";
import { fmtMin } from "@/lib/estado";
import { agruparCentros, rangoCentro, type HistorialCentro } from "@/lib/historial-centros";

const tareasDe = (centro: HistorialCentro) => centro.ofs.reduce((n, of) => n + (of.tareas?.length ?? 0), 0);

export function HistorialTareas({ pedido, ofs, seccion, className = "mb-2", compacto = false }: {
  pedido: string;
  ofs: HistorialOF[];
  seccion: SeccionId;
  /** Márgenes del botón, según dónde vaya. */
  className?: string;
  /** En la lista va en la columna del tiempo, que es estrecha: rótulo corto,
   *  con el largo en el `title`.
   *
   *  Visible siempre, no al pasar el ratón. Vive dentro de un pedido ya
   *  desplegado, y desplegarlos todos no es lo normal: un botón por pedido
   *  abierto no llega a ser ruido, y esconderlo obliga a descubrirlo. */
  compacto?: boolean;
}) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const centros = agruparCentros(ofs)
    .filter((centro) => centro.ofs.length)
    .sort((a, b) => rangoCentro(a.id, seccion) - rangoCentro(b.id, seccion));
  // Los centros sin un minuto no dicen nada: van plegados en una línea.
  const conTiempo = centros.filter((centro) => centro.totalMin > 0);
  const sinTiempo = centros.filter((centro) => centro.totalMin <= 0);
  const pinta = (centro: HistorialCentro) => <CentroTareas key={centro.id} centro={centro} />;
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-expanded={abierto}
        aria-controls={id}
        title={compacto ? "Tareas y tiempos" : undefined}
        className={`${className} chip-3d shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-text`}
      >
        {compacto ? "Tareas" : "Tareas y tiempos"}
      </button>
      <div id={id} popover="auto" data-historial-extra="" onToggle={(e) => setAbierto(e.newState === "open")}
        onKeyDown={(e) => { if (e.key === "Escape") e.stopPropagation(); }}
        className="ventana-3d scroll-thin m-auto max-h-[75vh] w-[min(680px,92vw)] overflow-y-auto rounded-xl p-4 text-text backdrop:bg-black/30">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Tareas y tiempos · <span className="font-mono">{pedido}</span></h3>
          <button type="button" popoverTarget={id} popoverTargetAction="hide" className="rounded px-2 py-1 text-xs hover:bg-surface-2">Cerrar</button>
        </div>
        {conTiempo.map(pinta)}
        {sinTiempo.length > 0 && (
          <details className={`text-xs ${conTiempo.length ? "mt-4 border-t border-border pt-2" : ""}`}>
            <summary className="cursor-pointer text-text-muted hover:text-text">
              Sin tiempo echado: {sinTiempo.map((centro) => {
                const n = tareasDe(centro);
                return n ? `${centro.nombre} (${n} ${n === 1 ? "tarea" : "tareas"})` : centro.nombre;
              }).join(" · ")}
            </summary>
            <div className="mt-3">{sinTiempo.map(pinta)}</div>
          </details>
        )}
      </div>
    </>
  );
}

/** Un centro con sus OF y, dentro, sus tareas.
 *
 *  QUIÉN ECHÓ CADA TAREA SALE EN TODOS LOS CENTROS, no solo en el que se está
 *  mirando. Esta ventana se abre justo para eso, y dejar Diseño y Taller con un
 *  número y sin nadie obligaba a preguntar por el pasillo quién lo había hecho.
 *  Fuera de aquí la regla no cambia: la lista y la ficha siguen enseñando la
 *  gente de la sección consultada (ver `centrosConDesglose`). */
function CentroTareas({ centro }: { centro: HistorialCentro }) {
  return (
    <section className="mb-4 last:mb-0">
      <h4 className="mb-2 flex justify-between text-sm font-semibold" title="Tiempo imputado en RPS"><span>{centro.nombre}</span><span>{fmtMin(centro.totalMin)}</span></h4>
      {centro.ofs.map((of) => (
        <div key={of.codigo} className="mb-2 border-t border-border pt-2 text-xs">
          <p className="mb-1 font-semibold">{of.codigo} · {of.descripcion}</p>
          {of.tareas?.length ? of.tareas.map((tarea) => {
            const personas = tarea.personas.filter((p) => p.min > 0).sort(porMinutos);
            const vacia = tarea.tiempoImputadoMin <= 0;
            // Con UNA sola persona su tiempo es el de la tarea, que está al
            // final de la misma línea: ponerlo detrás del nombre era escribir
            // dos veces el mismo número. Con varias sí hace falta el de cada
            // uno, que es lo que el total no dice.
            const solaEllaEntera =
              personas.length === 1 && personas[0].min === tarea.tiempoImputadoMin;
            return (
              <p key={tarea.codigo} className={`flex items-baseline gap-3 py-1 ${vacia ? "text-text-muted" : ""}`}>
                <span className="min-w-0 flex-1">{tarea.codigo} · {tarea.descripcion}</span>
                {personas.length > 0 && (
                  <span className="text-right text-text-muted">
                    {solaEllaEntera
                      ? personas[0].nombre
                      : personas.map((p) => `${p.nombre} ${fmtMin(p.min)}`).join(" · ")}
                  </span>
                )}
                <span className={`shrink-0 ${vacia ? "" : "font-semibold"}`}>{fmtMin(tarea.tiempoImputadoMin)}</span>
              </p>
            );
          }) : <p className="text-text-muted">Sin desglose de tareas disponible.</p>}
        </div>
      ))}
    </section>
  );
}
