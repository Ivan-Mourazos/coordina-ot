"use client";

import { memo, useRef } from "react";
import type { Operario, Rol } from "@/lib/types";
import { ROL } from "@/lib/estado";
import type { Facet } from "./PedidoCard";
import { PanelCompanero } from "./PanelCompanero";
import { LiveDot } from "./LiveBadge";
import type { LiveInfo } from "./Board";
import { agruparPorFase } from "@/lib/fases-tablero";
import { bloquesDeCarga, type ItemCarga } from "@/lib/equipo";
import type { Seccion } from "@/lib/secciones";
import { tintaSobre } from "@/lib/tinta";

/** Tarjeta compacta de un compañero: nombre, si está fichando AHORA (y con
 *  qué rol), y una barra con la distribución de sus OF por fase. Zona
 *  droppable (arrastra un parte encima para asignárselo). Al pulsar,
 *  despliega sus partes agrupados sin robar sitio a la bandeja. */
export const TecnicoCard = memo(function TecnicoCard({
  operario,
  facets,
  revisiones,
  escala,
  seccion,
  live,
  expanded,
  onToggle,
  onClose,
  onOpen,
  onFichar,
  onDesficharVarias,
  completarPedido,
  onCoger,
}: {
  operario: Operario;
  facets: Facet[];
  /** Pedidos que le toca revisar (por_revisar o en_revision a su nombre). */
  revisiones: ItemCarga[];
  /** Carga del compañero más cargado: la barra se mide contra ella. */
  escala: number;
  /** De qué sección es lo que se está pintando. De ella sale el ORDEN de las
   *  columnas (ver `ordenFases` en lib/secciones.ts). */
  seccion: Seccion;
  live: LiveInfo | null;
  expanded: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpen: (f: Facet) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  /** Para el reloj en varias OF a la vez; lo usa la pausa por pedido de
   *  PedidoLinea (ver desficharVarias en Board). */
  onDesficharVarias: (ofIds: string[]) => void;
  completarPedido: (pedidoId: string) => void;
  /** Quedarse con un pedido suyo, desde su panel. Lo pregunta el Board. */
  onCoger?: (f: Facet) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // La barra cuenta PEDIDOS, no OFs, para que case con el "N ped" de al lado:
  // dos números distintos midiendo lo mismo obligan a mirar dos veces.
  const porFase = agruparPorFase(facets, seccion).map((g) => ({ ...g, n: g.items.length }));
  const bloques = bloquesDeCarga({
    revisiones,
    grupos: porFase.map((g) => ({
      label: g.label,
      color: g.color,
      items: g.items.map((f) => ({ id: f.pedido.id, atrasado: !!f.atrasado })),
    })),
    vivo: live ? { id: live.pedido.id, revisando: live.rol === "revisar" } : null,
    colorRevisar: ROL.revisar.color,
  });
  const tarde = bloques.filter((b) => b.atrasado).length;
  // Cada bloque mide lo mismo en TODAS las tarjetas: 1/escala del ancho, con
  // la escala del más cargado. Con muchos pedidos el bloque se queda en unos
  // pocos px y el hueco de 1 px se comería la mitad: entonces van pegados y la
  // barra se lee por tramos de color, como antes.
  const ancho = `${100 / escala}%`;
  const conHueco = escala <= 30;
  const resumen = [
    revisiones.length > 0 ? `Por revisar: ${revisiones.length}` : null,
    ...porFase.filter((f) => f.n).map((f) => `${f.label}: ${f.n}`),
    tarde > 0 ? `Fuera de fecha: ${tarde}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      ref={rootRef}
      // 170 px de mínimo y no 230: con 230, en una pantalla de 1024 px la
      // quinta persona bajaba sola a otra fila y ocupaba todo el ancho. El
      // nombre ya se recorta (truncate) si no cabe.
      className="relative min-w-[170px] flex-1"
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className={`glass-panel w-full rounded-xl px-3 py-2 text-left bajo:py-1.5 transition-colors ${expanded ? "ring-1 ring-brand-400" : ""}`}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
            style={{ background: operario.color, color: tintaSobre(operario.color) }}
          >
            {operario.iniciales}
          </span>
          <span className="truncate text-xs font-semibold text-text">{operario.nombre}</span>

          {live && (
            <span
              className="ml-auto flex min-w-0 shrink items-center gap-1 text-[10px] font-bold"
              style={{ color: ROL[live.rol].color }}
              title={`${ROL[live.rol].label} ${live.pedido.codigo} · ${live.of.descripcion}`}
            >
              <LiveDot rol={live.rol} className="size-1.5" />
              <span className="truncate">{live.pedido.codigo}</span>
            </span>
          )}

          {/* Cuánto lleva. En qué está cargado lo dice la barra de abajo, así
              que aquí no se repiten distintivos por fase. */}
          <span className={`shrink-0 text-[10px] text-text-muted ${live ? "" : "ml-auto"}`}>
            {facets.length} ped
            {revisiones.length > 0 && (
              <>
                {" · "}
                <span className={ROL.revisar.texto}>{revisiones.length} rev</span>
              </>
            )}
            {tarde > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-red-700 dark:text-red-400">{tarde} tarde</span>
              </>
            )}
          </span>

          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`size-3 shrink-0 text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Barra de carga: un bloque por pedido, del color de su columna y en
            el orden de la zona de arriba (ver bloquesDeCarga). Dice EN QUÉ
            está cargado cada uno y, con la escala común, CUÁNTO comparado con
            los demás: lo que queda de pista vacía es margen para más trabajo.
            El pedido que está fichando late; los fuera de fecha llevan una
            raya roja debajo, que el color de la fase ya está cogido. */}
        <div className="mt-1.5 bajo:mt-1" title={resumen}>
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--glass-highlight)]">
            {bloques.map((b) => (
              <span key={`${b.fase}-${b.id}`} className={`h-full shrink-0 ${conHueco ? "pr-px" : ""}`} style={{ width: ancho }}>
                <span
                  className={`block h-full ${b.vivo ? "animate-pulse" : ""}`}
                  style={{ background: b.color }}
                />
              </span>
            ))}
          </div>
          {tarde > 0 && (
            <div aria-hidden="true" className="mt-px flex h-0.5 w-full">
              {bloques.map((b) => (
                <span key={`${b.fase}-${b.id}`} className={`h-full shrink-0 ${conHueco ? "pr-px" : ""}`} style={{ width: ancho }}>
                  {b.atrasado && <span className="block h-full rounded-full bg-red-600" />}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      {/* El panel se pinta aquí, pero se posiciona y se cierra solo: eso lo
          lleva PanelFlotante, compartido con el desplegable «+N más». */}
      {expanded && (
        <PanelCompanero
          operario={operario}
          facets={facets}
          seccion={seccion}
          live={live}
          onOpen={onOpen}
          onCerrar={onClose}
          onFichar={onFichar}
          onDesficharVarias={onDesficharVarias}
          completarPedido={completarPedido}
          onCoger={onCoger}
        />
      )}
    </div>
  );
});
