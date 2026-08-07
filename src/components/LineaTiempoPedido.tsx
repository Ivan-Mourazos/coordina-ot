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

      {/* La línea. Los hitos van posicionados en porcentaje sobre ella, así que
          el contenedor necesita altura propia: los hijos son absolutos. */}
      <div className="relative h-10">
        <div className="absolute inset-x-0 top-1 h-1 rounded-full bg-border" />
        {/* Lo recorrido hasta hoy, para que el avance se vea de un vistazo. */}
        <div
          className={`absolute left-0 top-1 h-1 rounded-full ${
            urgente ? "bg-red-500/60" : "bg-brand-400"
          }`}
          style={{ width: `${hoyPct}%` }}
        />

        {hitos.map((h) => (
          <div
            key={h.clave}
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${h.pct}%` }}
          >
            <span className="size-3 rounded-full border-2 border-surface bg-text-muted" />
            <span className="mt-1 whitespace-nowrap text-[9px] font-semibold uppercase tracking-wide text-text-muted">
              {h.etiqueta}
            </span>
            <span className="whitespace-nowrap text-[10px] font-medium text-text">
              {fmtDiaMes(h.iso)}
            </span>
          </div>
        ))}

        {/* Hoy. Va por encima de los hitos y con el color de urgencia; si cae
            fuera del recorrido se queda en el extremo, y el título lo explica
            en vez de dibujar un punto donde no hay línea. */}
        <div
          className="absolute top-0 -translate-x-1/2"
          style={{ left: `${hoyPct}%` }}
          title={
            hoyFuera
              ? diasParaEntrega < 0
                ? `Hoy (${entrega.completa}: ya pasó)`
                : "Hoy, antes de que entrara el pedido"
              : "Hoy"
          }
        >
          <span
            className={`block size-3 rounded-full ring-2 ring-surface ${
              urgente ? "bg-red-600" : "bg-brand-500"
            } ${hoyFuera ? "opacity-50" : ""}`}
          />
        </div>
      </div>
    </div>
  );
}
