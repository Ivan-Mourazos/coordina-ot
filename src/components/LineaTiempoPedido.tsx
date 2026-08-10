"use client";

import type { Pedido } from "@/lib/types";
import { hoyISO } from "@/lib/types";
import { lineaTiempo } from "@/lib/linea-tiempo";
import { fmtDiaMes, relativoA } from "@/lib/fechas";

/** Las tres fechas del pedido puestas a escala, con hoy encima.
 *
 *  Sueltas en la ficha ("Solicitud 20/07, Planificación 01/08") no dicen si
 *  vamos con tiempo: hay que restar de cabeza. En una línea a escala se ve
 *  dónde estamos y cuánto queda sin pensar. */
export function LineaTiempoPedido({ pedido }: { pedido: Pedido }) {
  const hoy = hoyISO();
  const { hitos, hoyPct, hoyFuera, diasParaEntrega } = lineaTiempo(pedido, hoy);
  const entrega = relativoA(pedido.fechaEntrega, hoy);
  const urgente = diasParaEntrega < 0 || diasParaEntrega <= 2;

  return (
    <div className="mb-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] px-3 pb-3 pt-2">
      <div className="mb-4 flex items-baseline justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Recorrido del pedido
        </p>
        <p
          className={`text-[11px] font-semibold ${
            urgente ? "text-red-600 dark:text-red-400" : "text-text-muted"
          }`}
        >
          {diasParaEntrega < 0
            ? `Entrega vencida hace ${-diasParaEntrega} d`
            : diasParaEntrega === 0
              ? "Se entrega hoy"
              : `Quedan ${diasParaEntrega} d`}
        </p>
      </div>

      {/* SOLO los puntos van posicionados en la barra; las etiquetas van
          debajo, repartidas. Cuando dos hitos caen juntos —planificar el
          viernes y fabricar el lunes es lo normal— los textos absolutos se
          montaban uno encima de otro y no se leía ninguno. */}
      <div className="relative h-3">
        <div className="absolute inset-x-0 top-1 h-1 rounded-full bg-border" />
        {/* Lo recorrido hasta hoy, para que el avance se vea de un vistazo. */}
        <div
          className={`absolute left-0 top-1 h-1 rounded-full ${
            urgente ? "bg-red-500/60" : "bg-brand-400"
          }`}
          style={{ width: `${hoyPct}%` }}
        />

        {hitos.map((h) => (
          <span
            key={h.clave}
            className="absolute top-0 size-3 -translate-x-1/2 rounded-full border-2 border-surface bg-text-muted"
            style={{ left: `${h.pct}%` }}
            title={`${h.etiqueta}: ${fmtDiaMes(h.iso)}`}
          />
        ))}

        {/* Hoy, por encima de los hitos y con el color de urgencia. Si cae
            fuera del recorrido se queda en el extremo y el título lo explica,
            en vez de dibujar un punto donde no hay línea. */}
        <span
          className={`absolute top-0 block size-3 -translate-x-1/2 rounded-full ring-2 ring-surface ${
            urgente ? "bg-red-600" : "bg-brand-500"
          } ${hoyFuera ? "opacity-50" : ""}`}
          style={{ left: `${hoyPct}%` }}
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
