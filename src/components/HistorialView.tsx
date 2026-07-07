"use client";

import { useState } from "react";
import type { OF, Operario, Pedido } from "@/lib/types";
import { estaFinalizado, tiempoTotalOF, tiempoTotalPedido } from "@/lib/types";
import { fmtMin } from "@/lib/estado";
import { FamiliaTag } from "./FamiliaTag";
import { ReservaChip } from "./ReservaChip";

function fmt(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
}

function Avatar({ op, title }: { op: Operario | undefined; title: string }) {
  if (!op) return <span className="text-text-muted italic">—</span>;
  return (
    <span
      className="grid size-5 place-items-center rounded-full text-[9px] font-bold text-white"
      style={{ background: op.color }}
      title={`${title}: ${op.nombre}`}
    >
      {op.iniciales}
    </span>
  );
}

export function HistorialView({
  pedidos,
  operarios,
  onOpen,
}: {
  pedidos: Pedido[];
  operarios: Operario[];
  onOpen: (p: Pedido) => void;
}) {
  const opById = (id: string | null) => operarios.find((o) => o.id === id);
  const hechos = pedidos.filter((p) => p.situacion === "completado" || estaFinalizado(p));

  if (hechos.length === 0) {
    return (
      <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border text-sm text-text-muted">
        Aún no hay pedidos finalizados que coincidan con el filtro.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-text-muted">
        {hechos.length} pedido(s) finalizados por Oficina Técnica (más recientes
        arriba). Pulsa un pedido para ver sus OFs, tiempos y datos.
      </p>
      {hechos.map((p) => (
        <FilaHistorial key={p.id} pedido={p} opById={opById} onOpen={onOpen} />
      ))}
    </div>
  );
}

function FilaHistorial({
  pedido: p,
  opById,
  onOpen,
}: {
  pedido: Pedido;
  opById: (id: string | null) => Operario | undefined;
  onOpen: (p: Pedido) => void;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {/* cabecera contraída: resumen del pedido */}
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2/60"
      >
        <svg
          viewBox="0 0 24 24"
          className={`size-3.5 shrink-0 text-text-muted transition-transform ${abierto ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="size-2.5 shrink-0 rounded-full bg-teal-600" />
        <span className="font-semibold text-text">{p.codigo}</span>
        <span className="truncate text-sm text-text-muted">
          {p.cliente}
          {p.negocio && <span className="text-text"> · {p.negocio}</span>}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-3 text-xs text-text-muted">
          <span>{p.ofs.length} OF</span>
          <span>Finalizado {fmt(p.fechaPlanificacion)}</span>
          <span className="rounded bg-surface-2 px-2 py-0.5 font-semibold text-text ring-1 ring-border">
            Planteo {fmtMin(tiempoTotalPedido(p))}
          </span>
        </span>
      </button>

      {abierto && (
        <div className="border-t border-border">
          {p.comentarioVenta && (
            <p className="whitespace-pre-line border-b border-border bg-surface-2/40 px-4 py-2 text-[11px] leading-snug text-text-muted">
              <span className="font-semibold text-text">Comentario del pedido: </span>
              {p.comentarioVenta}
            </p>
          )}
          <ul className="divide-y divide-border">
            {p.ofs.map((of) => (
              <OFHistorial key={of.id} of={of} opById={opById} />
            ))}
          </ul>
          <div className="flex justify-end border-t border-border bg-surface-2/40 px-4 py-2">
            <button
              onClick={() => onOpen(p)}
              className="rounded-lg bg-surface px-2.5 py-1 text-[11px] font-semibold text-text ring-1 ring-border hover:bg-surface-2"
            >
              Ver parte escaneado ↗
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OFHistorial({
  of,
  opById,
}: {
  of: OF;
  opById: (id: string | null) => Operario | undefined;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="flex min-w-48 items-center gap-2">
        <span className="font-mono text-xs font-semibold text-text">{of.codigo}</span>
        <FamiliaTag familia={of.familia} />
        <span className="text-sm text-text">{of.descripcion}</span>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
        <Avatar op={opById(of.autorId)} title="Autor" />
        <span>→</span>
        <Avatar op={opById(of.revisorId)} title="Revisor" />
      </div>

      <div className="flex items-center gap-x-3 text-[11px]">
        <span className="text-text-muted">
          Planteo <b className="text-text">{fmtMin(of.tiempoPlanteoMin)}</b>
        </span>
        {of.tiempoRevisionMin > 0 && (
          <span className="text-text-muted">
            Revisión <b className="text-violet-600 dark:text-violet-400">{fmtMin(of.tiempoRevisionMin)}</b>
          </span>
        )}
        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-text ring-1 ring-border">
          {fmtMin(tiempoTotalOF(of))}
        </span>
      </div>

      {/* datos de interés: reservas de material y avisos de producción */}
      <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[10px]">
        {of.reservasMaterial !== undefined && of.reservasMaterial > 0 && (
          <ReservaChip n={of.reservasMaterial} detalle={of.reservasDetalle} />
        )}
        {of.avisos?.map((a) => (
          <span
            key={a}
            className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-indigo-700 dark:text-indigo-300"
            title="Aviso de producción"
          >
            📌 {a}
          </span>
        ))}
      </div>
    </li>
  );
}
