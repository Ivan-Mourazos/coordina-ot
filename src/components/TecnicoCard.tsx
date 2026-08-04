"use client";

import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDroppable } from "@dnd-kit/core";
import type { Operario, Rol } from "@/lib/types";
import { ROL } from "@/lib/estado";
import type { Facet } from "./PedidoCard";
import { PanelCompanero } from "./PanelCompanero";
import { LiveDot } from "./LiveBadge";
import type { LiveInfo } from "./Board";
import type { AccionOF } from "@/lib/acciones";
import { agruparPorFase } from "@/lib/fases-tablero";

/** Tarjeta compacta de un compañero: nombre, si está fichando AHORA (y con
 *  qué rol), y una barra con la distribución de sus OF por fase. Zona
 *  droppable (arrastra un parte encima para asignárselo). Al pulsar,
 *  despliega sus partes agrupados sin robar sitio a la bandeja. */
export const TecnicoCard = memo(function TecnicoCard({
  operario,
  facets,
  live,
  expanded,
  onToggle,
  onClose,
  onOpen,
  onAccion,
  onFichar,
  onDesfichar,
  completarPedido,
}: {
  operario: Operario;
  facets: Facet[];
  live: LiveInfo | null;
  expanded: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpen: (f: Facet) => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  completarPedido: (pedidoId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: operario.id });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  // Ancla del popup: se mide al desplegar. El popup vive en un portal con
  // posición fixed para no desbordar la página por abajo cuando el compañero
  // tiene muchos pedidos: si no cabe bajo la tarjeta, abre hacia arriba y su
  // altura se limita al espacio real disponible.
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  useEffect(() => {
    setAnchor(expanded ? rootRef.current?.getBoundingClientRect() ?? null : null);
  }, [expanded]);

  // Desplegado: se cierra con clic fuera (tarjeta o popup) o Escape.
  useEffect(() => {
    if (!expanded) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || popRef.current?.contains(t)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded, onClose]);

  // La barra reparte PEDIDOS, no OFs, para que case con el "N ped" de al lado:
  // dos números distintos midiendo lo mismo obligan a mirar dos veces.
  const porFase = agruparPorFase(facets).map((g) => ({ ...g, n: g.items.length }));

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        rootRef.current = el;
      }}
      className="relative min-w-[230px] flex-1"
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className={`glass-panel w-full rounded-xl px-3 py-2 text-left transition-colors ${
          isOver ? "border-brand-400 bg-brand-50/60 dark:bg-brand-900/15" : ""
        } ${expanded ? "ring-1 ring-brand-400" : ""}`}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
            style={{ background: operario.color }}
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
          </span>

          <svg
            viewBox="0 0 24 24"
            className={`size-3 shrink-0 text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Barra de carga por fase: dice EN QUÉ está cargado cada uno, no solo
            cuánto. Antes era de 1 px y al 70% de opacidad, ilegible. */}
        <div
          className="mt-1.5 flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-[var(--glass-highlight)]"
          title={porFase.filter((f) => f.n).map((f) => `${f.label}: ${f.n}`).join(" · ")}
        >
          {facets.length > 0 &&
            porFase
              .filter((f) => f.n > 0)
              .map((f) => (
                <span
                  key={f.id}
                  className="h-full"
                  style={{ width: `${(f.n / facets.length) * 100}%`, background: f.color }}
                />
              ))}
        </div>
      </button>

      {/* Fondo opaco (var --surface, inline gana a glass-pop) para que no se
          transparente el contenido del tablero de detrás. */}
      {expanded &&
        anchor &&
        typeof document !== "undefined" &&
        createPortal(
          (() => {
            // Ancho de casi toda la ventana, no de la tarjeta: dentro van las
            // cuatro fases en columnas, igual que en la zona personal, y con
            // 384 px no cabrían. Flota sobre la bandeja sin empujarla.
            const margin = 16;
            const vh = window.innerHeight;
            return (
              <div
                ref={popRef}
                style={{
                  left: margin,
                  right: margin,
                  top: Math.min(anchor.bottom + 6, vh - 160),
                }}
                className="fixed z-40"
              >
                <PanelCompanero
                  operario={operario}
                  facets={facets}
                  live={live}
                  onOpen={onOpen}
                  onCerrar={onClose}
                  onAccion={onAccion}
                  onFichar={onFichar}
                  onDesfichar={onDesfichar}
                  completarPedido={completarPedido}
                />
              </div>
            );
          })(),
          document.body,
        )}
    </div>
  );
});
