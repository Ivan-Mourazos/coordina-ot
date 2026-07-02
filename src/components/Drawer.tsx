"use client";

import { useEffect, useState } from "react";
import type { Operario, OF, Pedido } from "@/lib/types";
import { piezasTotal, tiempoTotalOF } from "@/lib/types";
import { ESTADO, fmtMin } from "@/lib/estado";
import { FamiliaTag } from "./FamiliaTag";
import { LiveBadge } from "./LiveBadge";
import { PedidoScan } from "./PedidoScan";
import { DevolverInline } from "./DevolverInline";
import { Select, OpDot, type SelectOption } from "./Select";

export type AccionOF = "empezar" | "pausar" | "terminar" | "aprobar" | "devolver" | "reabrir";

function fmt(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
}

function opcionesOperario(
  operarios: Operario[],
  miId: string | null,
  excluir?: string | null,
): SelectOption[] {
  return operarios
    .filter((o) => o.id !== excluir)
    .map((o) => ({
      value: o.id,
      label: o.id === miId ? `${o.nombre} (tú)` : o.nombre,
      icon: <OpDot color={o.color} iniciales={o.iniciales} />,
    }));
}

const PRIORIDAD_BG: Record<number, string> = {
  1: "#d23b3b",
  2: "#e79f1a",
  3: "#6b7280",
};

export function Drawer({
  pedido,
  operarios,
  miId,
  onClose,
  onAssignOF,
  onAssignPedido,
  onSetRevisor,
  onAccion,
}: {
  pedido: Pedido | null;
  operarios: Operario[];
  miId: string | null;
  onClose: () => void;
  onAssignOF: (ofId: string, autorId: string | null) => void;
  onAssignPedido: (autorId: string | null) => void;
  onSetRevisor: (ofId: string, revisorId: string | null) => void;
  onAccion: (ofId: string, accion: AccionOF, obs?: string) => void;
}) {
  useEffect(() => {
    if (!pedido) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pedido, onClose]);

  if (!pedido) return null;
  const opById = (id: string | null) => operarios.find((o) => o.id === id) ?? null;
  const esPdf = pedido.scanUrl?.toLowerCase().endsWith(".pdf") ?? false;

  return (
    <div className="fixed inset-0 z-50">
      <div className="overlay-in absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

      {/* PDF del pedido en grande, ocupando todo el hueco a la izquierda */}
      <div
        className="overlay-in absolute inset-y-0 left-0 right-[32rem] flex flex-col"
        onClick={onClose}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-3 bg-gradient-to-b from-black/60 to-transparent p-4 text-white">
          <span className="font-mono text-sm font-bold">{pedido.codigo}</span>
          <span className="text-sm text-white/70">{pedido.cliente}</span>
          {pedido.scanUrl && (
            <a
              href={pedido.scanUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="pointer-events-auto ml-auto rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold backdrop-blur-md hover:bg-white/30"
            >
              Abrir original ↗
            </a>
          )}
        </div>
        <div className="min-h-0 flex-1">
          {esPdf ? (
            <iframe
              src={pedido.scanUrl}
              title={`Pedido ${pedido.codigo}`}
              onClick={(e) => e.stopPropagation()}
              className="h-full w-full border-none bg-white"
            />
          ) : (
            <div
              onClick={(e) => e.stopPropagation()}
              className="h-full w-full bg-[#525659] p-4 pt-16"
            >
              <PedidoScan pedido={pedido} />
            </div>
          )}
        </div>
      </div>

      <aside className="glass-panel-strong drawer-in absolute right-0 top-0 flex h-full w-full max-w-lg flex-col rounded-l-2xl">
        {/* cabecera */}
        <header
          className="flex items-start gap-3 p-4"
          style={{ boxShadow: "inset 0 -1px 0 0 var(--glass-border)" }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-lg font-bold text-text">{pedido.codigo}</h2>
              <span
                className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white"
                style={{ background: PRIORIDAD_BG[pedido.prioridad] }}
              >
                P{pedido.prioridad}
              </span>
            </div>
            <p className="truncate text-sm text-text-muted">{pedido.cliente}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto p-4">
          {/* meta */}
          <div className="mb-4">
            <dl className="grid grid-cols-2 content-start gap-x-4 gap-y-2.5 text-xs">
              <Meta k="Solicitud" v={fmt(pedido.fechaSolicitud)} />
              <Meta k="Entrega" v={fmt(pedido.fechaEntrega)} />
              <Meta k="Planificación" v={fmt(pedido.fechaPlanificacion)} />
              <Meta k="Piezas" v={String(piezasTotal(pedido))} />
              <div className="col-span-2">
                <dt className="mb-1 text-text-muted">Familias</dt>
                <dd className="flex flex-wrap gap-1">
                  {[...new Set(pedido.ofs.map((o) => o.familia))].map((f) => (
                    <FamiliaTag key={f} familia={f} />
                  ))}
                </dd>
              </div>
            </dl>
          </div>

          {/* asignar autor del pedido entero */}
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] p-3">
            <span className="text-xs font-semibold text-text">Asignar autor (pedido entero)</span>
            <div className="ml-auto">
              <Select
                value={
                  pedido.ofs.every((of) => of.autorId === pedido.ofs[0].autorId)
                    ? pedido.ofs[0].autorId
                    : null
                }
                onChange={(v) => onAssignPedido(v)}
                placeholder="Sin asignar"
                alignRight
                options={opcionesOperario(operarios, miId)}
              />
            </div>
          </div>

          {/* OFs */}
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Órdenes de fabricación ({pedido.ofs.length})
          </h3>
          <ul className="space-y-2.5">
            {pedido.ofs.map((of) => (
              <OFRow
                key={of.id}
                of={of}
                operarios={operarios}
                opById={opById}
                miId={miId}
                onAssignOF={onAssignOF}
                onSetRevisor={onSetRevisor}
                onAccion={onAccion}
              />
            ))}
          </ul>
        </div>

        <footer
          className="p-3 text-[11px] leading-snug text-text-muted"
          style={{ boxShadow: "inset 0 1px 0 0 var(--glass-border)" }}
        >
          Tiempo de la OF = planteo (autor) + revisión (revisor). El revisor nunca puede
          ser el autor.
        </footer>
      </aside>

    </div>
  );
}

function Chip({ op, label }: { op: Operario | null; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[11px] text-text-muted">
      {label}
      {op ? (
        <span
          className="grid size-5 place-items-center rounded-full text-[9px] font-bold text-white"
          style={{ background: op.color }}
          title={op.nombre}
        >
          {op.iniciales}
        </span>
      ) : (
        <span className="italic">—</span>
      )}
    </span>
  );
}

function OFRow({
  of,
  operarios,
  opById,
  miId,
  onAssignOF,
  onSetRevisor,
  onAccion,
}: {
  of: OF;
  operarios: Operario[];
  opById: (id: string | null) => Operario | null;
  miId: string | null;
  onAssignOF: (ofId: string, autorId: string | null) => void;
  onSetRevisor: (ofId: string, revisorId: string | null) => void;
  onAccion: (ofId: string, accion: AccionOF, obs?: string) => void;
}) {
  const meta = ESTADO[of.estado];
  const autor = opById(of.autorId);
  const revisor = opById(of.revisorId);

  return (
    <li className="glass-chip rounded-xl p-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-semibold text-text">{of.codigo}</span>
        <FamiliaTag familia={of.familia} />
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${meta.chip}`}>
          {meta.label}
        </span>
        {of.fichandoRol && <LiveBadge rol={of.fichandoRol} />}
        <span className="ml-auto text-[11px] text-text-muted">{of.piezas} pz</span>
      </div>

      <p className="mt-1 text-sm text-text">{of.descripcion}</p>

      {of.observacion && (
        <p className="mt-1.5 rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-600 dark:text-red-400">
          ⚠ {of.observacion}
        </p>
      )}

      {/* tiempos: planteo + revisión = total */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="text-text-muted">
          Planteo <b className="text-emerald-700 dark:text-emerald-400">{fmtMin(of.tiempoPlanteoMin)}</b>
        </span>
        <span className="text-text-muted">
          Revisión <b className="text-violet-600 dark:text-violet-400">{fmtMin(of.tiempoRevisionMin)}</b>
        </span>
        <span className="ml-auto rounded-md bg-surface-2 px-1.5 py-0.5 font-semibold text-text ring-1 ring-border">
          Total {fmtMin(tiempoTotalOF(of))}
          <span className="ml-1 font-normal text-text-muted">/ est. {fmtMin(of.tiempoEstimadoMin)}</span>
        </span>
      </div>

      {/* archivos subidos a RPS */}
      {of.archivosRps && of.archivosRps.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-text-muted">RPS:</span>
          {of.archivosRps.map((a) => (
            <span
              key={a}
              className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-muted"
            >
              {a}
            </span>
          ))}
        </div>
      )}

      {/* roles */}
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="flex items-center justify-between gap-1.5 rounded-lg bg-surface-2/70 px-2 py-1.5">
          <Chip op={autor} label="Autor" />
          <Select
            value={of.autorId}
            onChange={(v) => onAssignOF(of.id, v)}
            placeholder="Sin asignar"
            alignRight
            options={opcionesOperario(operarios, miId)}
          />
        </div>
        <div className="flex items-center justify-between gap-1.5 rounded-lg bg-surface-2/70 px-2 py-1.5">
          <Chip op={revisor} label="Revisor" />
          <Select
            value={of.revisorId}
            onChange={(v) => onSetRevisor(of.id, v)}
            placeholder="Asignar…"
            alignRight
            options={opcionesOperario(operarios, miId, of.autorId)}
          />
        </div>
      </div>

      {/* acciones según estado */}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {of.estado === "pendiente" && of.autorId !== null && (
          <Btn onClick={() => onAccion(of.id, "empezar")} tone="teal">
            ▶ Empezar planteo
          </Btn>
        )}
        {(of.estado === "en_curso" || of.estado === "devuelta") && (
          <>
            {of.fichandoRol === "plantear" ? (
              <Btn onClick={() => onAccion(of.id, "pausar")} tone="amber">
                ⏸ Pausar tiempo
              </Btn>
            ) : (
              <Btn onClick={() => onAccion(of.id, "empezar")} tone="teal">
                ▶ Reanudar planteo
              </Btn>
            )}
            <Btn onClick={() => onAccion(of.id, "terminar")} tone="amber">
              Terminar planteo → a revisar
            </Btn>
          </>
        )}
        {of.estado === "por_revisar" && of.revisorId !== null && (
          <Btn onClick={() => onAccion(of.id, "empezar")} tone="teal">
            ▶ Empezar revisión
          </Btn>
        )}
        {of.estado === "en_revision" && (
          <>
            {of.fichandoRol === "revisar" ? (
              <Btn onClick={() => onAccion(of.id, "pausar")} tone="amber">
                ⏸ Pausar revisión
              </Btn>
            ) : (
              <Btn onClick={() => onAccion(of.id, "empezar")} tone="teal">
                ▶ Reanudar revisión
              </Btn>
            )}
            <Btn onClick={() => onAccion(of.id, "aprobar")} tone="teal">
              Aprobar → Producción
            </Btn>
            <DevolverInline onDevolver={(obs) => onAccion(of.id, "devolver", obs)} />
          </>
        )}
        {of.estado === "aprobada" && (
          <Btn onClick={() => onAccion(of.id, "reabrir")} tone="ghost">
            Reabrir revisión
          </Btn>
        )}
      </div>
    </li>
  );
}

function Btn({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: "amber" | "teal" | "ghost";
}) {
  const cls = {
    amber: "bg-amber-500 text-white hover:bg-amber-600",
    teal: "bg-teal-600 text-white hover:bg-teal-700",
    ghost: "border border-border text-text-muted hover:text-text hover:border-border-strong",
  }[tone];
  return (
    <button onClick={onClick} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {children}
    </button>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-text-muted">{k}</dt>
      <dd className="font-medium text-text">{v}</dd>
    </div>
  );
}
