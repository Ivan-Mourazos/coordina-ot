"use client";

import type { Pedido } from "@/lib/types";
import { hoyISO } from "@/lib/types";
import { TRAMO, lineaTiempo, urgenciaRecorrido } from "@/lib/linea-tiempo";
import { fmtDiaMes, relativoA } from "@/lib/fechas";

/** Las fechas del pedido puestas a escala, con hoy encima.
 *
 *  Sueltas en la ficha ("Solicitud 20/07, Planificación 01/08") no dicen si
 *  vamos con tiempo: hay que restar de cabeza. En una línea a escala se ve
 *  dónde estamos y cuánto queda sin pensar.
 *
 *  Es la MISMA línea que la fila de Pendientes, en grande. Y el mismo código de
 *  color: hasta ahora esta pintaba lo recorrido en dorado de marca (el 400) y
 *  el punto de hoy en el 500 —dos tonos del mismo amarillo que no se distinguen
 *  ni de cerca—, y saltaba a rojo cuando quedaban menos de dos días para la
 *  entrega. O sea: tres colores, ninguno con el significado que tienen en la
 *  lista, y midiendo contra la entrega en vez de contra la planificada, que es
 *  la fecha de OT. Ahora las dos salen de `urgenciaRecorrido`. */
export function LineaTiempoPedido({ pedido }: { pedido: Pedido }) {
  const hoy = hoyISO();
  const linea = lineaTiempo(pedido, hoy);
  const { hitos, hoyPct, hoyFuera, diasParaEntrega } = linea;
  const { actual, color, sinPlanificar, diasTarde, esHoyLaPlanificada, vencido } =
    urgenciaRecorrido(linea, pedido, hoy);
  const entrega = relativoA(pedido.fechaEntrega, hoy);

  return (
    <div className="mb-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] px-3 pb-3 pt-2">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
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

      {/* SOLO los puntos van posicionados en la barra; las etiquetas van
          debajo, repartidas. Cuando dos hitos caen juntos —planificar el
          viernes y fabricar el lunes es lo normal— los textos absolutos se
          montaban uno encima de otro y no se leía ninguno. */}
      <div className="relative h-3">
        <div className="absolute inset-x-0 top-1 h-1 rounded-full bg-border" />
        {/* El tramo en el que va el pedido HOY, del color de la escalada. Solo
            ese: los otros dos los recorre todo pedido que llega a tiempo, y
            pintarlos dejaría la línea siempre con un trozo rojo al final. */}
        {actual && (
          <div
            className="absolute top-1 h-1 rounded-full"
            style={{
              left: `${actual.desde}%`,
              width: `${actual.hasta - actual.desde}%`,
              background: vencido ? TRAMO.fuera : actual.color,
            }}
          />
        )}

        {hitos.map((h) => (
          <span
            key={h.clave}
            className="absolute top-0 size-3 -translate-x-1/2 rounded-full border-2 border-surface"
            style={{
              left: `${h.pct}%`,
              // La fecha que MANDA lleva el color de la escalada; las otras
              // tres son contexto y van en gris. Igual que en la lista: el
              // color vive siempre en el mismo hito.
              background: h.referencia && color ? color : "var(--text-muted)",
            }}
            title={`${h.etiqueta}: ${fmtDiaMes(h.iso)}`}
          />
        ))}

        {/* Hoy, por encima de los hitos. Sin color propio —el tramo ya lo
            dice— salvo cuando la entrega ya se incumplió. Si cae fuera del
            recorrido se queda en el extremo y el título lo explica, en vez de
            dibujar un punto donde no hay línea. */}
        <span
          className="absolute top-0 block size-3 -translate-x-1/2 rounded-full ring-2 ring-surface"
          style={{
            left: `${hoyPct}%`,
            background: vencido ? TRAMO.fuera : "var(--text)",
            opacity: hoyFuera && !vencido ? 0.5 : 1,
          }}
          title={
            hoyFuera
              ? diasParaEntrega < 0
                ? `Hoy (${entrega.completa}: ya pasó)`
                : "Hoy, antes de que entrara el pedido"
              : "Hoy"
          }
        />
      </div>

      {/* Leyenda: en fila, no sobre la barra. Así nunca se pisa, y el orden de
          izquierda a derecha ya dice a qué punto corresponde cada una. */}
      <div className="mt-2 flex justify-between gap-2">
        {hitos.map((h) => (
          <div key={h.clave} className="min-w-0">
            <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-text-muted">
              {h.etiqueta}
            </p>
            {/* La fecha que MANDA en el pedido va destacada: la planificada, o
                la solicitada en los que no tienen fecha de planteo. Igual que
                en la Lista — las dos líneas de la app cuentan lo mismo. */}
            <p
              className={`text-[10px] ${
                h.referencia ? "font-bold text-text" : "font-medium text-text-muted"
              }`}
              title={
                h.referencia && h.clave === "solicitada"
                  ? "Este pedido no tiene fecha de planificación en RPS, así que la referencia es la entrega."
                  : undefined
              }
            >
              {fmtDiaMes(h.iso)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
