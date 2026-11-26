"use client";

import { useRef } from "react";
import type { Pedido } from "@/lib/types";
import { hoyISO } from "@/lib/types";
import {
  TRAMO,
  agruparMismoDia,
  lineaTiempo,
  partirEnSolicitada,
  pctSolicitada,
  repartirEtiquetasPx,
  urgenciaRecorrido,
} from "@/lib/linea-tiempo";
import { fmtDiaMes, relativoA } from "@/lib/fechas";
import { anchoTexto, useAncho } from "@/lib/medir-texto";
import { AcentoBloque } from "./AcentoBloque";
import { ChipComprometida } from "./ChipComprometida";

/** Ancho de reserva hasta que se mide el bloque (primer pintado). */
const ANCHO_RESERVA_PX = 560;

/** Las fechas del pedido puestas a escala, con hoy encima.
 *
 *  Sueltas en la ficha ("Solicitud 20/07, Planificación 01/08") no dicen si
 *  vamos con tiempo: hay que restar de cabeza. En una línea a escala se ve
 *  dónde estamos y cuánto queda sin pensar.
 *
 *  Es la MISMA línea que la fila de Pendientes, en grande, y el mismo código
 *  de color: las dos salen de `urgenciaRecorrido`.
 *
 *  Rediseño del 26/11/2026 (ver `Recorrido` en ListaView): el nombre y la
 *  fecha de cada hito van DEBAJO DE SU PUNTO. Antes se repartían a partes
 *  iguales por el ancho y la Planificación del 27/11 quedaba rotulada en el
 *  33 % con su punto en el 13 %: había que emparejarlos por el orden, que
 *  además falla cuando RPS trae las fechas desordenadas. La solicitada es la
 *  meta (rombo, línea continua hasta ella, discontinua después) y hoy es una
 *  raya con su rótulo. */
export function LineaTiempoPedido({ pedido }: { pedido: Pedido }) {
  const caja = useRef<HTMLDivElement>(null);
  const ancho = useAncho(caja) ?? ANCHO_RESERVA_PX;
  const hoy = hoyISO();
  const linea = lineaTiempo(pedido, hoy);
  const { hitos, hoyPct, hoyFuera, diasParaEntrega } = linea;
  const u = urgenciaRecorrido(linea, pedido, hoy);
  const { actual, color, sinPlanificar, diasTarde, esHoyLaPlanificada, vencido, enPlazo } = u;
  const entrega = relativoA(pedido.fechaEntrega, hoy);
  const corte = pctSolicitada(hitos);
  const otYEntregaTarde = vencido && !enPlazo;

  // Con el año cuando el recorrido cruza de un año a otro, como en la lista.
  const aniosDistintos = new Set(hitos.map((h) => h.iso.slice(0, 4))).size > 1;
  const fmtHito = (iso: string) => `${fmtDiaMes(iso)}${aniosDistintos ? `/${iso.slice(2, 4)}` : ""}`;

  // Dos hitos el mismo día: un solo rótulo con los dos nombres.
  const grupos = agruparMismoDia(hitos).map((g) => {
    const nombre = g.hitos.map((h) => h.etiqueta).join(" · ");
    const w = Math.max(
      anchoTexto(nombre.toUpperCase(), { peso: 600, espaciadoEm: 0.025 }),
      anchoTexto(fmtHito(g.iso), { peso: 700 }),
    );
    return { g, nombre, w, x: (g.pct / 100) * ancho };
  });
  const izq = repartirEtiquetasPx(grupos, ancho, 12);

  const trazo = (desde: number, hasta: number, fondo: string) => {
    const { continuo, discontinuo } = partirEnSolicitada(desde, hasta, corte);
    return (
      <>
        {continuo && (
          <div
            className="absolute top-1 h-1 rounded-full"
            style={{ left: `${continuo[0]}%`, width: `${continuo[1] - continuo[0]}%`, background: fondo }}
          />
        )}
        {discontinuo && (
          <div
            className="absolute top-1 h-1"
            style={{
              left: `${discontinuo[0]}%`,
              width: `${discontinuo[1] - discontinuo[0]}%`,
              background: `repeating-linear-gradient(90deg, ${fondo} 0 4px, transparent 4px 8px)`,
            }}
          />
        )}
      </>
    );
  };

  return (
    <div className="bloque-3d mb-4 rounded-xl px-3 pb-3 pt-2 bajo:mb-2 bajo:pb-2 bajo:pt-1.5">
      {/* Más aire debajo de la cabecera que antes: ahí va el rótulo "Hoy". */}
      <div className="mb-5 flex items-baseline justify-between gap-2 bajo:mb-4">
        <p data-bloque="recorrido" className="cabecera-bloque flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-text">
          <AcentoBloque tipo="recorrido" />
          Recorrido del pedido
        </p>
        {/* Lo que se dice aquí es el estado de OT, no el del cliente: lo que
            manda es la PLANIFICADA, que es el día en que esto debería estar
            planteado. Antes ponía los días que faltaban para la entrega y se
            teñía de rojo a falta de dos, así que un pedido con el planteo tres
            semanas pasado de fecha decía tranquilamente "quedan 24 d". */}
        {sinPlanificar ? (
          <p
            className="text-[11px] font-semibold text-text-muted"
            title="Este pedido no tiene fecha de planificación en RPS. Se enseña la entrega como referencia, pero no se mide retraso contra ella: no es la fecha en que hay que plantearlo."
          >
            Sin planificar · entrega {entrega.etiqueta}
          </p>
        ) : (
          <p className="text-[11px] font-semibold" style={{ color }}>
            {esHoyLaPlanificada
              ? "Hay que plantearlo hoy"
              : diasTarde > 0
                ? `${diasTarde} d pasada la planificada`
                : `Quedan ${-diasTarde} d para plantearlo`}
          </p>
        )}
      </div>

      <div ref={caja}>
        <div className="relative h-3">
          {/* Fondo continuo hasta la solicitada y discontinuo después; encima,
              solo el tramo en el que va el pedido HOY (los otros los recorre
              todo pedido que llega a tiempo, y pintarlos dejaría siempre un
              trozo rojo al final). */}
          {trazo(0, 100, "var(--border-strong)")}
          {actual && u.colorTramo && trazo(actual.desde, actual.hasta, u.colorTramo)}

          {hitos.map((h) =>
            h.clave === "solicitada" ? (
              <span
                key={h.clave}
                className="absolute top-px size-2.5 -translate-x-1/2 rotate-45 ring-2 ring-surface"
                style={{ left: `${h.pct}%`, background: u.colorSolicitada ?? "var(--text)" }}
                title={`${h.etiqueta}: ${fmtDiaMes(h.iso)}${vencido ? " (ya pasó)" : ""}`}
              />
            ) : (
              <span
                key={h.clave}
                className="absolute top-0 size-3 -translate-x-1/2 rounded-full border-2 border-surface"
                style={{
                  left: `${h.pct}%`,
                  // La fecha que MANDA lleva el color de la escalada; las otras
                  // son contexto y van en gris. Igual que en la lista.
                  background: h.referencia && color ? color : "var(--progress-pending)",
                }}
                title={`${h.etiqueta}: ${fmtDiaMes(h.iso)}`}
              />
            ),
          )}

          {/* Hoy: una raya con su rótulo encima, no un punto que se confunda
              con un hito más. Morada solo si OT también va tarde. Si cae fuera
              del recorrido se queda en el extremo, atenuada. */}
          <span
            className="absolute -top-1.5 h-6 w-0.5 -translate-x-1/2 rounded-full ring-[1.5px] ring-surface"
            style={{
              left: `${hoyPct}%`,
              background: otYEntregaTarde ? TRAMO.fuera : "var(--hoy)",
              opacity: hoyFuera && !otYEntregaTarde ? 0.5 : 1,
            }}
            title={
              hoyFuera
                ? diasParaEntrega < 0
                  ? `Hoy (${entrega.completa}: ya pasó)`
                  : "Hoy, antes de que entrara el pedido"
                : "Hoy"
            }
          />
          <span
            className="absolute -top-[18px] -translate-x-1/2 text-[9px] font-bold uppercase leading-none tracking-wider text-text-muted"
            style={{ left: `clamp(10px, ${hoyPct}%, calc(100% - 10px))` }}
          >
            Hoy
          </span>
        </div>

        {/* Nombre y fecha DEBAJO de su punto. Si dos se pisarían, se apartan
            lo justo; la primera se alinea al borde izquierdo y la última al
            derecho para no salirse del bloque. */}
        <div className="relative mt-2 h-7 bajo:mt-1">
          {grupos.map(({ g, nombre, w }, i) => {
            const ref = g.hitos.some((h) => h.referencia);
            const solicitada = g.hitos.some((h) => h.clave === "solicitada");
            const alin = izq[i] <= 0.5 ? "text-left" : izq[i] + w >= ancho - 0.5 ? "text-right" : "text-center";
            return (
              <div key={g.iso} className={`absolute top-0 whitespace-nowrap ${alin}`} style={{ left: izq[i], width: w }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{nombre}</p>
                {/* La planificada, con el color de la escalada; la solicitada,
                    en negrita como meta del pedido (morada si ya pasó). */}
                <p
                  className={`text-[10px] ${ref || solicitada ? "font-bold" : "font-medium text-text-muted"}`}
                  style={{ color: ref ? color : solicitada ? (u.colorSolicitada ?? "var(--text)") : undefined }}
                  title={
                    ref && g.hitos[0].clave === "solicitada"
                      ? "Este pedido no tiene fecha de planificación en RPS, así que la referencia es la entrega."
                      : undefined
                  }
                >
                  {fmtHito(g.iso)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
      {pedido.fechaComprometida && (
        <p className="mt-2 bajo:mt-1">
          <ChipComprometida pedido={pedido} largo />
        </p>
      )}
    </div>
  );
}
