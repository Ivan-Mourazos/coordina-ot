"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { OF, Operario, Pedido } from "@/lib/types";
import { comprasPendientes, estadoMaterialDe, hoyISO } from "@/lib/types";
import { PedidoScan } from "./PedidoScan";
import { MenuAsignar } from "./MenuAsignar";
import { QuickLook } from "./QuickLook";
import { FamiliaIcon } from "./FamiliaTag";
import { LiveDot } from "./LiveBadge";
import { PRIORIDAD, ROL } from "@/lib/estado";
import { familiaMeta } from "@/lib/familia";

export interface Facet {
  pedido: Pedido;
  /** ubicación actual: id de operario autor, o null = bandeja */
  locationId: string | null;
  ofs: OF[];
  /** pasó la fecha de planificación y no está finalizado */
  atrasado?: boolean;
}

/** Parte visual (la usan la tarjeta y la Bandeja). El ancho
 *  lo pone el grid contenedor (tarjeta fluida, sin slider de tamaño). */
export const PedidoCardView = memo(function PedidoCardView({
  facet,
  operarios,
  mostrarPrioridad = false,
  mostrarFecha = false,
}: {
  facet: Facet;
  operarios: Operario[];
  /** Muestra prioridad + atrasado junto al código (pensado para la bandeja
   *  "Sin asignar", donde no hay agrupación por estado que ya lo indique). */
  mostrarPrioridad?: boolean;
  /** Muestra fecha dd/mm encima de la miniatura PDF. */
  mostrarFecha?: boolean;
}) {
  const { pedido, ofs } = facet;
  const fichando = ofs.find((o) => o.fichandoRol);
  const revisorId = ofs.find((o) => o.revisorId)?.revisorId ?? null;
  const revisor = operarios.find((o) => o.id === revisorId) ?? null;
  const atrasado = Boolean(facet.atrasado);
  const familias = [...new Set(ofs.map((o) => o.familia))];
  const materialPendiente = ofs
    .map((o) => o.materialPendienteHasta)
    .filter(Boolean)
    .sort()[0];
  const conRotulacion = ofs.some((o) => o.rotulacion);
  // El material, en la esquina de la miniatura: se decide coger un pedido
  // mirando esto, y antes el 🧵 solo aparecía si YA había reserva — o sea, la
  // mitad de la información. Ahora dice en qué punto está (ver estadoMaterial
  // en types.ts): asignado sin reservar, a medias, o cubierto.
  const material = estadoMaterialDe(ofs);
  const compras = comprasPendientes(ofs, hoyISO());

  return (
    <div className="w-full select-none">
      {mostrarFecha && (
        <div className="truncate px-0.5 text-[9px] leading-tight text-text-muted">
          {pedido.fechaPlanificacion.split("-").reverse().slice(0, 2).join("/")}
        </div>
      )}
      <div
        className="relative aspect-[210/297] w-full rounded-md bg-white shadow-sm ring-1 ring-black/10 transition-shadow hover:shadow-lg dark:ring-white/10"
      >
        <PedidoScan pedido={pedido} />

        {/* familias: para saber QUÉ es antes de cogerlo */}
        <span className="absolute left-0.5 top-0.5 flex flex-col gap-0.5">
          {familias.slice(0, 3).map((f) => (
            <span
              key={f}
              title={familiaMeta(f).label}
              className="grid size-4 place-items-center rounded bg-white/95 shadow-sm ring-1 ring-black/10"
            >
              <FamiliaIcon familia={f} className="size-2.5" />
            </span>
          ))}
        </span>

        {/* avisos de datos de RPS: material sin recibir / lleva rotulación */}
        <span className="absolute right-0.5 top-0.5 flex flex-col gap-0.5">
          {(compras.porLlegar > 0 || materialPendiente) && (
            <span
              title={
                compras.tarde > 0
                  ? `${compras.tarde} compra${compras.tarde === 1 ? "" : "s"} con la fecha de entrega ya pasada`
                  : compras.porLlegar > 0
                    ? `${compras.porLlegar} compra${compras.porLlegar === 1 ? "" : "s"} pedida${compras.porLlegar === 1 ? "" : "s"} y sin llegar`
                    : `Material de compras pedido, llega el ${materialPendiente!
                        .split("-")
                        .reverse()
                        .slice(0, 2)
                        .join("/")}`
              }
              // Rojo si la fecha de entrega ya pasó: eso es lo único de aquí
              // que puede parar el trabajo sin que nadie avise.
              className={`grid size-4 cursor-help place-items-center rounded text-[9px] shadow-sm ring-1 ring-black/10 ${
                compras.tarde > 0 ? "bg-red-500/95" : "bg-amber-400/95"
              }`}
            >
              📦
            </span>
          )}
          {conRotulacion && (
            <span
              title="Lleva rotulación"
              className="grid size-4 cursor-help place-items-center rounded bg-white/95 text-[9px] shadow-sm ring-1 ring-black/10"
            >
              🏷
            </span>
          )}
          {material && (
            <span
              title={
                material === "reservado"
                  ? "Almacén ha reservado todo el material"
                  : material === "aMedias"
                    ? "Almacén ha reservado solo parte del material"
                    : "Material asignado, Almacén todavía no lo ha reservado"
              }
              className={`grid size-4 cursor-help place-items-center rounded text-[9px] shadow-sm ring-1 ring-black/10 ${
                material === "reservado"
                  ? "bg-teal-500/90"
                  : material === "aMedias"
                    ? "bg-amber-400/95"
                    : "bg-white/95"
              }`}
            >
              🧵
            </span>
          )}
        </span>

        {/* dot de prioridad dentro de la miniatura (solo bandeja) */}
        {mostrarPrioridad && (
          <span
            className="absolute bottom-0.5 right-0.5 size-2.5 rounded-full ring-1 ring-white/80 shadow"
            style={{ background: PRIORIDAD[pedido.prioridad].color }}
            title={`Prioridad ${PRIORIDAD[pedido.prioridad].label}`}
          />
        )}

        {/* Han vuelto a escanear el parte y nadie lo ha dado por visto.
            Va SOBRE la miniatura, que es justo lo que ha cambiado: la tarjeta
            enseña el parte y aquí se avisa de que ese parte ya no es el que
            alguien leyó. Sin esto, en la bandeja de "Sin asignar" no había
            forma de saberlo sin abrir el pedido uno a uno. */}
        {facet.pedido.scanCambiado && (
          <span
            className="absolute bottom-1 right-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow"
            title="Han vuelto a escanear el parte de este pedido. Ábrelo para verlo y darlo por visto."
          >
            Parte nuevo
          </span>
        )}

        {/* Trabajo aparecido después de pasar el pedido a Producción. Ver la
            misma marca en PedidoLinea. */}
        {(facet.pedido.reabiertoPor?.length ?? 0) > 0 && (
          <span
            className="absolute right-1 top-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow"
            title="Este pedido ya se había pasado a Producción y ha aparecido trabajo nuevo sin hacer."
          >
            OF nueva
          </span>
        )}

        {/* fichando ahora, con el color del rol */}
        {fichando?.fichandoRol && (
          <span
            className="absolute bottom-1 left-1 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow"
            style={{ background: ROL[fichando.fichandoRol].color }}
          >
            <LiveDot rol={fichando.fichandoRol} className="size-1.5" />
            {fichando.fichandoRol === "revisar" ? "Revisando" : "Planteando"}
          </span>
        )}
      </div>

      {/* pie con datos */}
      <div className="mt-1 px-0.5">
        <div className="flex items-center gap-1">
          <span
            className={`truncate font-mono leading-tight ${
              mostrarPrioridad ? "text-[11px]" : "text-sm"
            } font-bold ${
              mostrarPrioridad && atrasado ? "text-red-600" : "text-text"
            }`}
          >
            {pedido.codigo}
          </span>
          {revisor && (
            <span
              className="ml-auto flex shrink-0 items-center gap-0.5 rounded-full px-1 text-[9px] font-bold text-white"
              style={{ background: revisor.color }}
              title={`Revisa: ${revisor.nombre}`}
            >
              <span className="opacity-80">rev</span>
              {revisor.iniciales}
            </span>
          )}
        </div>
        {/* cliente: solo en la bandeja (mostrarPrioridad), donde el código
         *  solo no basta para decidir a quién se asigna el parte */}
        {mostrarPrioridad && pedido.cliente && (
          <span
            className="block truncate text-[9px] leading-tight text-text-muted"
            title={pedido.cliente}
          >
            {pedido.cliente}
          </span>
        )}
        {!mostrarPrioridad && facet.pedido.negocio && (
          <div className="truncate text-[10px] leading-tight text-text-muted">
            {facet.pedido.negocio}
          </div>
        )}
      </div>
    </div>
  );
});

/** Tarjeta con clic para abrir el detalle, menú para asignarla sin arrastrar,
 *  y Quick Look al mantener
 *  el ratón (vista previa grande de la 1ª hoja del pedido). */
export const PedidoCard = memo(function PedidoCard({
  facet,
  operarios,
  onOpen,
  mostrarPrioridad = false,
  mostrarFecha = false,
  onAsignar,
  miId = null,
}: {
  facet: Facet;
  operarios: Operario[];
  onOpen: (f: Facet) => void;
  mostrarPrioridad?: boolean;
  mostrarFecha?: boolean;
  /** Sustituye al arrastre: dar el parte a alguien desde la propia tarjeta. */
  onAsignar?: (facet: Facet, operarioId: string) => void;
  miId?: string | null;
}) {

  const [peek, setPeek] = useState<DOMRect | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  function cancelPeek() {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setPeek(null);
  }
  useEffect(() => cancelPeek, []);
  return (
    <div
      ref={rootRef}
      onClick={() => onOpen(facet)}
      onMouseEnter={() => {
        hoverTimer.current = window.setTimeout(() => {
          const rect = rootRef.current?.getBoundingClientRect();
          if (rect) setPeek(rect);
        }, 350);
      }}
      onMouseLeave={cancelPeek}
      onMouseDown={cancelPeek}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(facet);
        }
      }}
      className="group relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      <PedidoCardView facet={facet} operarios={operarios} mostrarPrioridad={mostrarPrioridad} mostrarFecha={mostrarFecha} />
      {onAsignar && (
        <div className="absolute right-1 top-1">
          <MenuAsignar
            operarios={operarios}
            miId={miId}
            onAsignar={(op) => onAsignar(facet, op)}
          />
        </div>
      )}
      {peek && <QuickLook pedido={facet.pedido} anchor={peek} />}
    </div>
  );
});
