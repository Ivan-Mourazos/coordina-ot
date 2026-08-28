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
            {/* Agrupados por tipo y con un rótulo por grupo, en vez de una
                insignia en cada línea: con catorce cambios seguidos eran
                catorce insignias que descodificar una a una. Y cada grupo
                dice QUÉ ES, porque «arreglado» y «mejor» se pisan si no se
                explica la diferencia, y quien lo lee no tiene por qué
                adivinarla. */}
            {ORDEN.map((tipo) => {
              const suyos = n.cambios.filter((c) => c.tipo === tipo);
              if (suyos.length === 0) return null;
              return (
                <div key={tipo} className="mt-3">
                  <p className={`text-[11px] font-bold ${COLOR[tipo]}`}>{ETIQUETA[tipo]}</p>
                  <p className="text-[10px] text-text-muted">{QUE_ES[tipo]}</p>
                  <ul className="mt-1.5 flex flex-col gap-2">
                    {suyos.map((c) => (
                      <li key={c.titulo} className="border-l-2 border-border pl-2">
                        <span className="block text-xs font-semibold text-text">{c.titulo}</span>
                        {c.detalle && (
                          <span className="mt-0.5 block text-[11px] leading-snug text-text-muted">
                            {c.detalle}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </PanelFlotante>
  );
}

/** El orden en que se leen: primero lo que se gana, después lo que deja de
 *  fallar, y al final lo que solo va mejor. */
const ORDEN: TipoCambio[] = ["nuevo", "arreglado", "mejor"];

/** La diferencia entre los tres, dicha y no supuesta. Con los rótulos a secas
 *  "arreglado" y "mejor" se leen como lo mismo. */
const QUE_ES: Record<TipoCambio, string> = {
  nuevo: "Antes no se podía hacer",
  arreglado: "Fallaba, y ya no",
  mejor: "Funcionaba, pero ahora cuesta menos",
};

/** Verde lo que se gana, ámbar lo que se arregla, apagado lo que solo mejora.
 *  Solo el color del texto del rótulo, sin fondo: son tres rótulos en toda la
 *  entrada, y tres pastillas de color competirían con los títulos, que es lo
 *  que hay que leer.
 *
 *  No se usa el rojo de `devuelta` ni el violeta de `revisar`: aquí no se habla
 *  de OF, y repetir esos colores haría pensar que sí. */
const COLOR: Record<TipoCambio, string> = {
  nuevo: "text-emerald-700 dark:text-emerald-300",
  arreglado: "text-amber-700 dark:text-amber-300",
  mejor: "text-text-muted",
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
