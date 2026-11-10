"use client";

import { PanelFlotante, BotonCerrarPanel } from "./PanelFlotante";
import { APARTADOS_NOVEDADES, ETIQUETA, NOVEDADES, agruparCambios, type Cambio, type PerfilNovedades, type TipoCambio } from "@/lib/novedades";

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
  nuevos,
  perfil,
  onCerrar,
}: {
  /** Cuándo salió cada entrada, por su id. Puede faltar alguna —el sello lo
   *  pone el servidor y quizá no ha contestado todavía—: en ese caso se pinta
   *  el log sin fecha, que es el adorno, no el contenido. */
  fechas: Record<string, string>;
  /** Lo que esta persona no había leído (ver `cambiosSinLeer`): se pinta. */
  nuevos: ReadonlySet<Cambio>;
  perfil: PerfilNovedades;
  onCerrar: () => void;
}) {
  return (
    <PanelFlotante titulo="Novedades de la web" onCerrar={onCerrar}>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-bold text-text">Novedades de la web</h3>
        <BotonCerrarPanel className="ml-auto" />
      </div>
      {/* Dicho una vez arriba, y no con una etiqueta en cada línea: lo pintado
          ya se ve, solo hay que saber qué significa. */}
      {nuevos.size > 0 && (
        <p className="mb-3 flex items-center gap-1.5 text-[11px] text-text-muted">
          <span className="inline-block size-2 rounded-full bg-brand-500" aria-hidden="true" />
          Lo resaltado es nuevo desde la última vez que lo leíste.
        </p>
      )}

      <div className="flex flex-col gap-5">
        {NOVEDADES.map((n) => {
          const { propios, otros } = agruparCambios(n.cambios, perfil);
          return (
            <section key={n.id}>
              <h4 className="border-b border-border pb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                {n.fecha ? fecha(n.fecha) : fechas[n.id] ? fecha(fechas[n.id]) : "Última actualización"}
              </h4>
              <ListaCambios cambios={propios} nuevos={nuevos} mostrarApartado={perfil === "direccion"} />
              {otros.map((grupo) => (
                <details key={grupo.apartado} className="mt-3">
                  <summary className="cursor-pointer rounded-lg text-xs font-semibold text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-focus">
                    {grupo.cambios.length} {grupo.cambios.length === 1 ? "cambio" : "cambios"} en la pantalla de {APARTADOS_NOVEDADES[grupo.apartado]}
                  </summary>
                  <ListaCambios cambios={grupo.cambios} nuevos={nuevos} />
                </details>
              ))}
            </section>
          );
        })}
      </div>
    </PanelFlotante>
  );
}

function ListaCambios({ cambios, nuevos, mostrarApartado = false }: {
  cambios: readonly Cambio[];
  nuevos: ReadonlySet<Cambio>;
  mostrarApartado?: boolean;
}) {
  return ORDEN.map((tipo) => {
    const suyos = cambios.filter((c) => c.tipo === tipo);
    if (suyos.length === 0) return null;
    return (
      <div key={tipo} className="mt-3">
        <p className={`text-[11px] font-bold ${COLOR[tipo]}`}>{ETIQUETA[tipo]}</p>
        <p className="text-[10px] text-text-muted">{QUE_ES[tipo]}</p>
        <ul className="mt-1.5 flex flex-col gap-2">
          {suyos.map((c) => (
            <li
              key={c.titulo}
              className={nuevos.has(c)
                ? "rounded-r border-l-2 border-brand-500 bg-brand-500/10 py-1 pl-2 pr-1 dark:bg-brand-400/10"
                : "border-l-2 border-border pl-2"}
            >
              {nuevos.has(c) && <span className="sr-only">Nuevo para ti: </span>}
              {mostrarApartado && c.apartado && <span className="block text-[10px] text-text-muted">{APARTADOS_NOVEDADES[c.apartado]}</span>}
              <span className="block text-xs font-semibold text-text">{c.titulo}</span>
              {c.detalle && <span className="mt-0.5 block text-[11px] leading-snug text-text-muted">{c.detalle}</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  });
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
