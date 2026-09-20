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
import { avisaDeOFNueva } from "@/lib/fases-tablero";
import { tintaSobre } from "@/lib/tinta";
import { IconoCaja, IconoEtiqueta, IconoMaterial } from "./Iconos";

/** El color de la prioridad CUANDO ES TEXTO. No sale de `PRIORIDAD.color`:
 *  ese ámbar es para fondos y como letra de 9 px da 2,5:1 sobre blanco, que no
 *  se lee. Son los mismos tonos que la app ya usa para texto en color (los
 *  avisos de parado, las bandas de parte nuevo). */
const TINTA_PRIORIDAD: Record<1 | 2 | 3, string> = {
  3: "text-red-700 dark:text-red-300",
  2: "text-amber-700 dark:text-amber-300",
  1: "text-text-muted",
};

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
  accion,
}: {
  facet: Facet;
  operarios: Operario[];
  /** Botón al pie de la MINIATURA (asignar). Va aquí dentro y no lo coloca
   *  quien monta la tarjeta: por fuera, el pie de la tarjeta es el código del
   *  pedido, y el botón caía encima tapándolo. */
  accion?: React.ReactNode;
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
  // Lo que GRITA, en una banda arriba del todo y no como chip en una esquina:
  // los chips tapaban el punto de prioridad y se peleaban con el botón de
  // asignar por el mismo sitio. Nunca salen los dos: si han vuelto a escanear
  // el parte, eso es lo que hay que mirar.
  const avisoParte = pedido.scanCambiado
    ? {
        texto: "Parte nuevo",
        title: "Han vuelto a escanear el parte de este pedido. Ábrelo para verlo y darlo por visto.",
      }
    : avisaDeOFNueva(pedido)
      ? {
          texto: "OF nueva",
          title: "Este pedido ya se había pasado a Producción y ha aparecido trabajo nuevo sin hacer.",
        }
      : null;
  // Con banda, lo de las esquinas de arriba baja para no quedar debajo. Las dos
  // clases enteras y no construidas: Tailwind solo compila lo que ve escrito.
  const arriba = avisoParte ? "top-4" : "top-0.5";

  return (
    <div className="w-full select-none">
      {/* La línea de encima del parte: la fecha y, detrás, la prioridad.
          Aquí sobra sitio —la fecha son cinco caracteres de setenta y siete— y
          las dos cosas se leen juntas, que es como se decide qué coger.
          Estaba en el pie, delante del código, y le comía los 8 px justos que
          le faltaban para entrar entero: medido, el código necesita 73 px y
          con el punto solo le quedaban 65. */}
      {(mostrarFecha || mostrarPrioridad) && (
        <div className="flex items-center gap-1 px-0.5 text-[10px] leading-tight text-text-muted">
          {mostrarFecha && (
            <span className="truncate">
              {pedido.fechaPlanificacion.split("-").reverse().slice(0, 2).join("/")}
            </span>
          )}
          {/* «11/09 · URGENTE». En letra y no en punto de color: un punto hay
              que saber descifrarlo, y aquí hay sitio de sobra para decirlo.
              SOLO LAS URGENTES. La normal salía en casi todos los partes (16 de
              19 en la bandeja de hoy) y la poca prioridad no cambia lo que hay
              que hacer: lo que se busca de un vistazo es lo que corre prisa.
              Las tres siguen en el filtro de prioridad de la barra. */}
          {mostrarPrioridad && pedido.prioridad === 3 && (
            <>
              <span aria-hidden className="shrink-0 text-text-muted">·</span>
              <span
                className={`shrink-0 font-semibold ${TINTA_PRIORIDAD[pedido.prioridad]}`}
                title={`Prioridad ${PRIORIDAD[pedido.prioridad].label}`}
              >
                {PRIORIDAD[pedido.prioridad].label.toUpperCase()}
              </span>
            </>
          )}
        </div>
      )}
      {/* `overflow-hidden`: lo que se pone encima del parte (la banda de aviso,
          la barra de asignar) se recorta con el redondeo de la MINIATURA, no
          con el suyo. Con cada uno redondeando por su cuenta, en las esquinas
          de abajo asomaba un pico de parte por debajo del botón. */}
      <div className="relative aspect-[210/297] w-full overflow-hidden rounded-md bg-white parte-3d">
        <PedidoScan pedido={pedido} />

        {/* Han vuelto a escanear el parte, o ha aparecido trabajo nuevo después
            de pasarlo. Banda del ancho de la tarjeta: se lee de un vistazo en la
            bandeja y no tapa nada de lo que hay en las esquinas. */}
        {avisoParte && (
          <span className="absolute inset-x-0 top-0 flex">
            <span
              className="w-full truncate bg-amber-700 px-1 py-0.5 text-center text-[9px] font-bold uppercase leading-tight text-white"
              title={avisoParte.title}
            >
              {avisoParte.texto}
            </span>
          </span>
        )}

        {/* familias: para saber QUÉ es antes de cogerlo */}
        <span className={`absolute left-0.5 ${arriba} flex flex-col gap-0.5`}>
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

        {/* avisos de datos de RPS: material sin recibir / lleva rotulación.
            En FILA y no en columna: en columna bajaban por la derecha hasta
            media tarjeta, justo por donde cae el botón de asignar. */}
        <span className={`absolute right-0.5 ${arriba} flex gap-0.5`}>
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
              <IconoCaja className={`size-3 ${compras.tarde > 0 ? "text-white" : "text-[#1a1206]"}`} />
            </span>
          )}
          {conRotulacion && (
            <span
              title="Lleva rotulación"
              className="grid size-4 cursor-help place-items-center rounded bg-white/95 text-[9px] shadow-sm ring-1 ring-black/10"
            >
              {/* Iconos de línea en las tres esquinas (compras, rotulación,
                  material), como en la ficha: eran dos emoji y un icono, tres
                  dibujos de estilos distintos en 16 px. La tinta es fija y no
                  la del tema, porque el fondo de cada cuadro es de color fijo:
                  en oscuro, el texto claro se perdía sobre el blanco. */}
              <IconoEtiqueta className="size-3 text-[#1a1206]" />
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
              <IconoMaterial className="size-3 text-[#1a1206]" />
            </span>
          )}
        </span>

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

        {/* Asignar, como barra al pie de la miniatura y no como chip en la
            esquina: ahí tapaba los avisos de material justo mientras decides a
            quién se lo das, y caía encima de "OF nueva". El pie del parte es
            sitio muerto y da un blanco ancho. */}
        {/* La barra llega hasta el borde y la recorta la miniatura (ver su
            `overflow-hidden`), así no queda el pico blanco entre el arco del
            botón y el de la tarjeta. */}
        {accion && (
          <div className="absolute inset-x-0 bottom-0 flex">
            {accion}
          </div>
        )}
      </div>

      {/* pie con datos */}
      <div className="mt-1 px-0.5">
        <div className="flex items-center gap-1">
          <span
            className={`truncate font-mono leading-tight ${
              mostrarPrioridad ? "text-[11px]" : "text-sm"
            } font-bold ${
              mostrarPrioridad && atrasado ? "text-red-700 dark:text-red-400" : "text-text"
            }`}
          >
            {pedido.codigo}
          </span>
          {revisor && (
            <span
              className="ml-auto flex shrink-0 items-center gap-0.5 rounded-full px-1 text-[9px] font-bold text-white"
              style={{ background: revisor.color, color: tintaSobre(revisor.color) }}
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
            className="block truncate text-[10px] leading-tight text-text-muted"
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
      <PedidoCardView
        facet={facet}
        operarios={operarios}
        mostrarPrioridad={mostrarPrioridad}
        mostrarFecha={mostrarFecha}
        accion={
          onAsignar && (
            <MenuAsignar
              operarios={operarios}
              miId={miId}
              onAsignar={(op) => onAsignar(facet, op)}
              // Opaco: al 95 % el parte se transparentaba bajo el botón.
              claseBoton="w-full bg-brand-500 px-2 py-1 text-[10px] font-bold text-[#231903] shadow-sm hover:bg-brand-600"
            />
          )
        }
      />
      {peek && <QuickLook pedido={facet.pedido} anchor={peek} />}
    </div>
  );
});
