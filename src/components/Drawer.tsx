"use client";

import type { Operario, OF, Pedido } from "@/lib/types";
import { familiasDe, piezasTotal, tiempoTotalOF } from "@/lib/types";
import { ESTADO, fmtMin } from "@/lib/estado";

export type AccionOF = "terminar" | "aprobar" | "devolver" | "reabrir";

function fmt(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
}

function OperarioSelect({
  operarios,
  value,
  onChange,
  excluir,
  placeholder = "Sin asignar",
}: {
  operarios: Operario[];
  value: string | null;
  onChange: (v: string | null) => void;
  excluir?: string | null;
  placeholder?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-text outline-none focus:border-brand-400"
    >
      <option value="">{placeholder}</option>
      {operarios
        .filter((o) => o.id !== excluir)
        .map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
    </select>
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

export function Drawer({
  pedido,
  operarios,
  onClose,
  onAssignOF,
  onAssignPedido,
  onSetRevisor,
  onAccion,
}: {
  pedido: Pedido | null;
  operarios: Operario[];
  onClose: () => void;
  onAssignOF: (ofId: string, autorId: string | null) => void;
  onAssignPedido: (autorId: string | null) => void;
  onSetRevisor: (ofId: string, revisorId: string | null) => void;
  onAccion: (ofId: string, accion: AccionOF, obs?: string) => void;
}) {
  if (!pedido) return null;
  const opById = (id: string | null) => operarios.find((o) => o.id === id) ?? null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col bg-surface shadow-2xl">
        {/* cabecera */}
        <header className="flex items-start gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-text">{pedido.codigo}</h2>
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                style={{
                  background:
                    pedido.prioridad === 1 ? "#d23b3b" : pedido.prioridad === 2 ? "#d39a1c" : "#6b7280",
                }}
              >
                P{pedido.prioridad}
              </span>
            </div>
            <p className="truncate text-sm text-text-muted">{pedido.cliente}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-surface-2 hover:text-text"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto p-4">
          {/* meta */}
          <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Meta k="Solicitud" v={fmt(pedido.fechaSolicitud)} />
            <Meta k="Entrega" v={fmt(pedido.fechaEntrega)} />
            <Meta k="Piezas" v={String(piezasTotal(pedido))} />
            <Meta k="Familias" v={familiasDe(pedido).join(", ")} />
          </dl>

          {/* asignar autor del pedido entero */}
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-3">
            <span className="text-xs font-semibold text-text">Asignar autor (pedido entero)</span>
            <div className="ml-auto">
              <OperarioSelect
                operarios={operarios}
                value={
                  pedido.ofs.every((of) => of.autorId === pedido.ofs[0].autorId)
                    ? pedido.ofs[0].autorId
                    : null
                }
                onChange={(v) => onAssignPedido(v)}
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
                onAssignOF={onAssignOF}
                onSetRevisor={onSetRevisor}
                onAccion={onAccion}
              />
            ))}
          </ul>
        </div>

        <footer className="border-t border-border p-3 text-[11px] leading-snug text-text-muted">
          Tiempo de la OF = planteo (autor) + revisión (revisor). El revisor nunca puede
          ser el autor.
        </footer>
      </aside>
    </div>
  );
}

function OFRow({
  of,
  operarios,
  opById,
  onAssignOF,
  onSetRevisor,
  onAccion,
}: {
  of: OF;
  operarios: Operario[];
  opById: (id: string | null) => Operario | null;
  onAssignOF: (ofId: string, autorId: string | null) => void;
  onSetRevisor: (ofId: string, revisorId: string | null) => void;
  onAccion: (ofId: string, accion: AccionOF, obs?: string) => void;
}) {
  const meta = ESTADO[of.estado];
  const autor = opById(of.autorId);
  const revisor = opById(of.revisorId);

  return (
    <li className={`rounded-lg border-l-4 border border-border bg-surface p-3 ${meta.border}`}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-semibold text-text">{of.codigo}</span>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-text-muted ring-1 ring-border">
          {of.familia}
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${meta.chip}`}>
          {meta.label}
        </span>
        {of.fichandoRol && (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-600">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-600" />
            {of.fichandoRol === "revisar" ? "revisando" : "planteando"}
          </span>
        )}
        <span className="ml-auto text-[11px] text-text-muted">{of.piezas} pz</span>
      </div>

      <p className="mt-1 text-sm text-text">{of.descripcion}</p>

      {of.observacion && (
        <p className="mt-1.5 rounded bg-red-500/10 px-2 py-1 text-[11px] text-red-600 dark:text-red-400">
          ⚠ {of.observacion}
        </p>
      )}

      {/* tiempos: planteo + revisión = total */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="text-text-muted">
          Planteo <b className="text-text">{fmtMin(of.tiempoPlanteoMin)}</b>
        </span>
        <span className="text-text-muted">
          Revisión <b className="text-violet-600 dark:text-violet-400">{fmtMin(of.tiempoRevisionMin)}</b>
        </span>
        <span className="ml-auto rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-text ring-1 ring-border">
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
              className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-muted"
            >
              {a}
            </span>
          ))}
        </div>
      )}

      {/* roles */}
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="flex items-center justify-between gap-1 rounded-md bg-surface-2 px-2 py-1.5">
          <Chip op={autor} label="Autor" />
          <OperarioSelect operarios={operarios} value={of.autorId} onChange={(v) => onAssignOF(of.id, v)} />
        </div>
        <div className="flex items-center justify-between gap-1 rounded-md bg-surface-2 px-2 py-1.5">
          <Chip op={revisor} label="Revisor" />
          <OperarioSelect
            operarios={operarios}
            value={of.revisorId}
            excluir={of.autorId}
            placeholder="Asignar…"
            onChange={(v) => onSetRevisor(of.id, v)}
          />
        </div>
      </div>

      {/* acciones según estado */}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {(of.estado === "en_curso" || of.estado === "devuelta") && (
          <Btn onClick={() => onAccion(of.id, "terminar")} tone="amber">
            Terminar planteo → a revisar
          </Btn>
        )}
        {of.estado === "en_revision" && (
          <>
            <Btn onClick={() => onAccion(of.id, "aprobar")} tone="teal">
              Aprobar → Producción
            </Btn>
            <Btn
              onClick={() => {
                const obs = window.prompt("Motivo de la devolución:") ?? "";
                onAccion(of.id, "devolver", obs);
              }}
              tone="red"
            >
              Devolver
            </Btn>
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
  tone: "amber" | "teal" | "red" | "ghost";
}) {
  const cls = {
    amber: "bg-amber-500 text-white hover:bg-amber-600",
    teal: "bg-teal-600 text-white hover:bg-teal-700",
    red: "bg-red-600 text-white hover:bg-red-700",
    ghost: "border border-border text-text-muted hover:text-text hover:border-border-strong",
  }[tone];
  return (
    <button onClick={onClick} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${cls}`}>
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
