"use client";

import type { ImputacionRps, Operario } from "@/lib/types";
import { fmtMin } from "@/lib/estado";
import { fmtFechaLarga } from "@/lib/fechas";
import { nombreRps } from "@/lib/nombre-rps";
import { OpDot } from "./Select";

/** Quién ha echado el tiempo de esta OF en RPS, persona a persona.
 *
 *  Va aparte de la línea de Autor a propósito, porque son dos cosas distintas
 *  que hasta ahora se leían como una sola:
 *
 *  - **Autor** es la asignación de CoordinaOT: de quién es el trabajo AHORA.
 *  - **Esto** es el registro del terminal de RPS: quién lo hizo y cuánto.
 *
 *  No son "los pedidos viejos": mientras se siga fichando en las dos
 *  herramientas, el tiempo de esta semana también entra por aquí. Lo que pasa
 *  es que el panel solo enseñaba el total —"planteo 23 h"— y para saber de
 *  quién era había que asignárselo a alguien a mano, que es justo inventarse el
 *  dato. Y donde sí había autor deducido tampoco cuadraba: se deduce del que
 *  más minutos lleva, así que las 23 h de la OF 0217537 salían todas bajo
 *  Alberto cuando 1 h 33 eran de Jaime. Aquí cada uno lleva lo suyo.
 *
 *  Estos minutos están DENTRO de `tiempoPlanteoMin`, así que la línea de Autor
 *  descuenta lo de aquí y solo cuenta lo fichado en la web (ver
 *  lib/imputaciones.ts). El "Total" de la OF sigue siendo la suma de los dos. */
export function FichadoEnRps({
  imputaciones,
  opById,
}: {
  imputaciones: ImputacionRps[];
  opById: (id: string | null) => Operario | null;
}) {
  if (imputaciones.length === 0) return null;

  return (
    <div className="mt-1.5 rounded-lg bg-surface-2/70 px-2 py-1.5">
      <p
        className="text-[10px] font-semibold uppercase tracking-wide text-text-muted"
        title="Tiempo imputado en RPS a la tarea de Oficina Técnica de esta OF: lo que registró el terminal de fichaje de siempre, sea de esta mañana o de hace dos años. Es lo que se hizo y quién lo hizo; el autor de arriba es de quién es la OF ahora."
      >
        Ya fichado en RPS
      </p>
      <ul className="mt-1 space-y-0.5">
        {imputaciones.map((i) => (
          <Linea key={i.empleado} imputacion={i} op={opById(i.operarioId)} />
        ))}
      </ul>
    </div>
  );
}

function Linea({ imputacion, op }: { imputacion: ImputacionRps; op: Operario | null }) {
  return (
    <li className="flex items-center gap-1.5 text-[11px]">
      {op ? (
        <OpDot color={op.color} iniciales={op.iniciales} />
      ) : (
        // Quien no está en el mapa de operarios de OT no tiene color ni
        // iniciales nuestras, pero el tiempo es suyo y tiene que verse: se
        // marca con un hueco del mismo tamaño para que las filas no bailen.
        <span className="size-4.5 shrink-0 rounded-full ring-1 ring-inset ring-border" />
      )}
      <span className="truncate text-text">{op ? op.nombre : nombreRps(imputacion.nombre)}</span>
      {imputacion.desde && (
        <span className="shrink-0 text-text-muted" title="Primera vez que fichó en esta OF">
          desde {fmtFechaLarga(imputacion.desde)}
        </span>
      )}
      <b className="ml-auto shrink-0 font-semibold text-text">{fmtMin(imputacion.minutos)}</b>
    </li>
  );
}
