"use client";

import { PanelFlotante, BotonCerrarPanel } from "./PanelFlotante";
import { ETIQUETA, NOVEDADES, type TipoCambio } from "@/lib/novedades";

/** Qué ha cambiado en la web, por actualizaciones.
 *
 *  De la más reciente a la más antigua: lo que se viene a mirar es lo último,
 *  y lo de antes está por si alguien vuelve de vacaciones y quiere ponerse al
 *  día de varias de golpe.
 *
 *  Cada cambio lleva una marca de qué es —nuevo, arreglado, mejor—, porque no
 *  se leen igual: lo nuevo hay que aprenderlo, lo arreglado solo hay que saber
 *  que ya no pasa. */
export function PanelNovedades({
  fechas,
  onCerrar,
}: {
  /** Cuándo salió cada entrada, por su id. Puede faltar alguna —el sello lo
   *  pone el servidor y quizá no ha contestado todavía—: en ese caso se pinta
   *  el log sin fecha, que es el adorno, no el contenido. */
  fechas: Record<string, string>;
  onCerrar: () => void;
}) {
  return (
    <PanelFlotante titulo="Novedades de la web" onCerrar={onCerrar}>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-bold text-text">Novedades de la web</h3>
        <BotonCerrarPanel className="ml-auto" />
      </div>

      <div className="flex flex-col gap-5">
        {NOVEDADES.map((n) => (
          <section key={n.id}>
            <h4 className="border-b border-border pb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              {/* La suya si la trae —las de antes de este log, sacadas del
                  historial de cambios—; si no, la que sello el servidor. */}
              {n.fecha ? fecha(n.fecha) : fechas[n.id] ? fecha(fechas[n.id]) : "Última actualización"}
            </h4>
            <ul className="mt-2 flex flex-col gap-2.5">
              {n.cambios.map((c) => (
                <li key={c.titulo} className="flex gap-2">
                  <span
                    className={`mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${COLOR[c.tipo]}`}
                  >
                    {ETIQUETA[c.tipo]}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-text">{c.titulo}</span>
                    {c.detalle && (
                      <span className="mt-0.5 block text-[11px] leading-snug text-text-muted">
                        {c.detalle}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PanelFlotante>
  );
}

/** Verde lo que se gana, ámbar lo que se arregla, gris lo que solo mejora. No
 *  se usa el rojo de `devuelta` ni el violeta de `revisar`: aquí no se habla de
 *  OF, y repetir esos colores haría pensar que sí. */
const COLOR: Record<TipoCambio, string> = {
  nuevo: "bg-emerald-600/15 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300",
  arreglado: "bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  mejor: "bg-surface-2 text-text-muted ring-1 ring-border",
};

/** "31 de agosto de 2026". Escrita entera: es una fecha que se lee una vez, no
 *  una columna que haya que comparar, así que gana lo legible sobre lo corto.
 *
 *  Llega como instante completo (la selló el servidor con su reloj), no como
 *  día suelto, así que se parsea tal cual. */
function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
