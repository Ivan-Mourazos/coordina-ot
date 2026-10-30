"use client";

import type { Pedido } from "@/lib/types";
import { hoyISO } from "@/lib/types";
import { comprometidaVencida } from "@/lib/comprometida";
import { fmtDiaMes, fmtDiaMesAno } from "@/lib/fechas";

/** La fecha que Producción ha comprometido con el cliente. Azul, que no usa
 *  ninguna otra fecha del pedido, y rojo si ya pasó sin pasarlo a Producción.
 *  No toca «atrasado»: eso sigue midiéndose contra la planificada. */
export function ChipComprometida({
  pedido,
  largo = false,
  soloFecha = false,
  sobreParte = false,
  className = "",
}: {
  pedido: Pick<Pedido, "fechaComprometida" | "situacion">;
  /** Con el año y diciendo con quién, para la ficha. */
  largo?: boolean;
  /** Para filas estrechas: una línea de más desplazaría el resto del panel, así
   *  que aquí basta el color y el título al pasar el ratón. */
  soloFecha?: boolean;
  /** Encima de la miniatura, que es blanca también en tema oscuro. */
  sobreParte?: boolean;
  className?: string;
}) {
  if (!pedido.fechaComprometida) return null;
  const vencida = comprometidaVencida(pedido, hoyISO());
  const fecha = fmtDiaMesAno(pedido.fechaComprometida);
  return (
    <span
      title={
        vencida
          ? `Comprometida con el cliente para el ${fecha}. Ya pasó y el pedido sigue sin pasar a Producción.`
          : `Producción se ha comprometido con el cliente para el ${fecha}.`
      }
      className={`rounded px-1 text-[10px] font-semibold leading-4 ${
        sobreParte
          ? vencida
            ? "bg-red-100 text-red-800"
            : "bg-sky-100 text-sky-800"
          : vencida
            ? "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200"
            : "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200"
      } ${className}`}
    >
      {largo ? (
        `Comprometida con el cliente: ${fecha}`
      ) : soloFecha ? (
        <>
          <span className="sr-only">Comprometida </span>
          {fmtDiaMes(pedido.fechaComprometida)}
        </>
      ) : (
        `Comprometida ${fmtDiaMes(pedido.fechaComprometida)}`
      )}
    </span>
  );
}
