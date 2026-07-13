"use client";

import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDroppable } from "@dnd-kit/core";
import type { OF, Operario, Rol } from "@/lib/types";
import { ROL } from "@/lib/estado";
import type { Facet } from "./PedidoCard";
import { PedidosPorEstado } from "./PedidosPorEstado";
import { LiveDot } from "./LiveBadge";
import type { LiveInfo } from "./Board";
import type { AccionOF } from "@/lib/acciones";

// En qué fase está cada OF, para la barra de distribución del técnico.
const FASES = [
  { id: "sin", label: "Sin empezar", color: "#9ca3af" },
  { id: "planteo", label: "Planteando", color: "#059669" },
  { id: "revision", label: "Para revisar", color: "#7c3aed" },
  { id: "ok", label: "Finalizado", color: "#0891b2" },
] as const;

function faseDe(of: OF): (typeof FASES)[number]["id"] {
  if (of.estado === "aprobada") return "ok";
  if (of.estado === "por_revisar" || of.estado === "en_revision") return "revision";
  if (of.estado === "devuelta") return "planteo";
  return of.tiempoPlanteoMin > 0 || of.fichandoRol ? "planteo" : "sin";
}

/** Tarjeta compacta de un compañero: nombre, si está fichando AHORA (y con
 *  qué rol), y una barra con la distribución de sus OF por fase. Zona
 *  droppable (arrastra un parte encima para asignárselo). Al pulsar,
 *  despliega sus partes agrupados sin robar sitio a la bandeja. */
export const TecnicoCard = memo(function TecnicoCard({
  operario,
  operarios,
  facets,
  live,
  expanded,
  onToggle,
  onClose,
  onOpen,
  onAccion,
  onFichar,
  onDesfichar,
  setRevisor,
  completarPedido,
}: {
  operario: Operario;
  operarios: Operario[];
  facets: Facet[];
  live: LiveInfo | null;
  expanded: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpen: (f: Facet) => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  setRevisor: (ofId: string, revisorId: string | null) => void;
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

  const ofs = facets.flatMap((f) => f.ofs);
  const porFase = FASES.map((fase) => ({
    ...fase,
    n: ofs.filter((o) => faseDe(o) === fase.id).length,
  }));

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

          {/* distintivos rápidos: cuántas OF planteando / por revisar */}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {porFase
              .filter((f) => (f.id === "planteo" || f.id === "revision") && f.n > 0)
              .map((f) => (
                <span
                  key={f.id}
                  title={`${f.label}: ${f.n} OF`}
                  className="flex items-center gap-0.5 rounded-full px-1.5 text-[9px] font-bold text-white"
                  style={{ background: f.color }}
                >
                  {f.n}
                </span>
              ))}
          </span>

          {live ? (
            <span
              className="flex min-w-0 shrink items-center gap-1 text-[10px] font-bold"
              style={{ color: ROL[live.rol].color }}
              title={`${ROL[live.rol].label} ${live.pedido.codigo} · ${live.of.descripcion}`}
            >
              <LiveDot rol={live.rol} className="size-1.5" />
              <span className="truncate">{ROL[live.rol].label}</span>
            </span>
          ) : (
            <span className="text-[10px] text-text-muted">
              {facets.length}·{ofs.length}
            </span>
          )}

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

        {/* barra de distribución por fase: fina y en tono rebajado — es
            contexto secundario, el dato fuerte ya está en los badges. */}
        <div
          className="mt-1.5 flex h-1 w-full gap-px overflow-hidden rounded-full bg-[var(--glass-highlight)] opacity-70"
          title={porFase.filter((f) => f.n).map((f) => `${f.label}: ${f.n} OF`).join(" · ")}
        >
          {ofs.length > 0 &&
            porFase
              .filter((f) => f.n > 0)
              .map((f) => (
                <span
                  key={f.id}
                  className="h-full rounded-full"
                  style={{ width: `${(f.n / ofs.length) * 100}%`, background: f.color }}
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
            const margin = 12;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const W = Math.min(384, vw - 2 * margin); // 24rem
            const left = Math.min(Math.max(margin, anchor.left), vw - W - margin);
            const abajo = vh - anchor.bottom - margin - 6;
            const arriba = anchor.top - margin - 6;
            const abreAbajo = abajo >= 240 || abajo >= arriba;
            const maxH = Math.min(vh * 0.6, abreAbajo ? abajo : arriba);
            return (
              <div
                ref={popRef}
                style={{
                  background: "var(--surface)",
                  left,
                  width: W,
                  maxHeight: maxH,
                  ...(abreAbajo
                    ? { top: anchor.bottom + 6 }
                    : { bottom: vh - anchor.top + 6 }),
                }}
                className="glass-pop scroll-thin fixed z-40 overflow-y-auto overflow-x-hidden rounded-xl p-3"
              >
                <PedidosPorEstado
                  facets={facets}
                  operarios={operarios}
                  onOpen={onOpen}
                  layout="list"
                  accionable={false}
                  onAccion={onAccion}
                  onFichar={onFichar}
                  onDesfichar={onDesfichar}
                  setRevisor={setRevisor}
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
