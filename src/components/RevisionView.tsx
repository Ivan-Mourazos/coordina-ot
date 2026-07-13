"use client";

import type { EstadoOF, OF, Operario, Pedido } from "@/lib/types";
import { ESTADO } from "@/lib/estado";
import { ACCIONES, type AccionOF } from "@/lib/acciones";
import { FamiliaIcon } from "./FamiliaTag";
import { LiveDot } from "./LiveBadge";
import { DevolverInline } from "./DevolverInline";
import { useConfirmacion } from "./ConfirmDialog";
import { Select, OpDot } from "./Select";

interface RFacet {
  pedido: Pedido;
  ofs: OF[];
}

const COLUMNAS: { estado: EstadoOF; titulo: string }[] = [
  { estado: "por_revisar", titulo: "Por revisar" },
  { estado: "en_revision", titulo: "En revisión" },
  { estado: "aprobada", titulo: "Aprobadas" },
  { estado: "devuelta", titulo: "Devueltas" },
];

export function RevisionView({
  pedidos,
  operarios,
  miId,
  onOpen,
  onSetRevisor,
  onAccion,
}: {
  pedidos: Pedido[];
  operarios: Operario[];
  miId: string | null;
  onOpen: (p: Pedido) => void;
  onSetRevisor: (ofId: string, revisorId: string | null) => void;
  onAccion: (ofId: string, accion: AccionOF, obs?: string) => void;
}) {
  const facetsDe = (estado: EstadoOF): RFacet[] =>
    pedidos
      .map((p) => ({ pedido: p, ofs: p.ofs.filter((o) => o.estado === estado) }))
      .filter((f) => f.ofs.length > 0);

  // Resumen "para revisar" (sin login): cuántas sin revisor y quién debe revisar.
  const sinRevisor = pedidos.reduce(
    (n, p) => n + p.ofs.filter((o) => o.estado === "por_revisar" && !o.revisorId).length,
    0,
  );
  const porRevisor = new Map<string, number>();
  pedidos.forEach((p) =>
    p.ofs.forEach((o) => {
      if (o.estado === "en_revision" && o.revisorId)
        porRevisor.set(o.revisorId, (porRevisor.get(o.revisorId) ?? 0) + 1);
    }),
  );

  return (
    <>
      <div className="glass-panel mb-4 flex flex-wrap items-center gap-2 rounded-xl p-3">
        <span className="text-sm font-semibold text-text">Para revisar</span>
        <span className="flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <span className="size-2 rounded-full bg-amber-500" />
          {sinRevisor} sin revisor asignado
        </span>
        <span className="mx-1 text-text-muted">·</span>
        <span className="text-xs text-text-muted">En revisión por:</span>
        {porRevisor.size === 0 ? (
          <span className="text-xs text-text-muted italic">nadie</span>
        ) : (
          [...porRevisor.entries()].map(([id, n]) => {
            const op = operarios.find((o) => o.id === id);
            if (!op) return null;
            return (
              <span
                key={id}
                className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1 text-xs font-medium text-text ring-1 ring-border"
              >
                <span
                  className="grid size-5 place-items-center rounded-full text-[9px] font-bold text-white"
                  style={{ background: op.color }}
                >
                  {op.iniciales}
                </span>
                {op.nombre}
                <span className="rounded-full bg-violet-600 px-1.5 text-[10px] font-bold text-white">
                  {n}
                </span>
              </span>
            );
          })
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNAS.map((col) => {
        const facets = facetsDe(col.estado);
        const meta = ESTADO[col.estado];
        const nOF = facets.reduce((n, f) => n + f.ofs.length, 0);
        return (
          <div key={col.estado} className="flex flex-col rounded-xl border border-border bg-zone p-3">
            <div className="mb-3 flex items-center gap-2">
              <span className={`size-2.5 rounded-full ${meta.dot}`} />
              <h2 className="text-sm font-semibold text-text">{col.titulo}</h2>
              <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-text-muted ring-1 ring-border">
                {nOF} OF
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {facets.length === 0 ? (
                <div className="grid min-h-20 place-items-center rounded-lg border border-dashed border-border text-xs text-text-muted">
                  Vacío
                </div>
              ) : (
                facets.map((f) => (
                  <ReviewCard
                    key={f.pedido.id}
                    facet={f}
                    estado={col.estado}
                    operarios={operarios}
                    miId={miId}
                    onOpen={() => onOpen(f.pedido)}
                    onSetRevisor={onSetRevisor}
                    onAccion={onAccion}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
      </div>
    </>
  );
}

function Avatar({ op, title }: { op: Operario | undefined; title: string }) {
  if (!op) return null;
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

function ReviewCard({
  facet,
  estado,
  operarios,
  miId,
  onOpen,
  onSetRevisor,
  onAccion,
}: {
  facet: RFacet;
  estado: EstadoOF;
  operarios: Operario[];
  miId: string | null;
  onOpen: () => void;
  onSetRevisor: (ofId: string, revisorId: string | null) => void;
  onAccion: (ofId: string, accion: AccionOF, obs?: string) => void;
}) {
  const { pedido, ofs } = facet;
  const meta = ESTADO[estado];
  const autores = new Set(ofs.map((o) => o.autorId).filter(Boolean) as string[]);
  const ofIds = ofs.map((o) => o.id);

  function setRevisorTodas(revisorId: string | null) {
    ofIds.forEach((id) => onSetRevisor(id, revisorId));
  }
  function accionTodas(accion: AccionOF, obs?: string) {
    ofIds.forEach((id) => onAccion(id, accion, obs));
  }

  // Revisor común del grupo (si todas las OFs comparten uno) para pintar el
  // Select con el valor real en vez de vacío.
  const revisorComun =
    ofs.length > 0 && ofs.every((o) => o.revisorId === ofs[0].revisorId)
      ? ofs[0].revisorId
      : null;
  const todasConRevisor = ofs.every((o) => o.revisorId);

  // Confirmación de "Aprobar" desde la máquina de estados: mismo texto y tono
  // que el botón equivalente del Drawer.
  const defAprobar = ACCIONES.find((a) => a.id === "aprobar")!;
  const { pedirConfirmacion, dialogo } = useConfirmacion(() => accionTodas("aprobar"));

  return (
    <div className={`rounded-lg border-l-4 border border-border bg-surface p-2.5 ${meta.border}`}>
      <button onClick={onOpen} className="block w-full text-left">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-text">{pedido.codigo}</span>
          <span className="ml-auto text-[10px] text-text-muted">{ofs.length} OF</span>
        </div>
        <div className="truncate text-[11px] text-text-muted">{pedido.cliente}</div>
        <ul className="mt-1.5 space-y-1">
          {ofs.map((of) => (
            <li key={of.id} className="flex items-center gap-1.5 text-[11px]">
              <FamiliaIcon familia={of.familia} className="size-3" />
              <span className="font-mono text-text-muted">{of.codigo}</span>
              <span className="truncate text-text">{of.descripcion}</span>
              {of.fichandoRol && (
                <span title={of.fichandoRol === "revisar" ? "Revisando ahora" : "Planteando ahora"} className="inline-flex">
                  <LiveDot rol={of.fichandoRol} className="size-1.5" />
                </span>
              )}
              <span className="ml-auto flex items-center gap-1">
                <Avatar op={operarios.find((o) => o.id === of.autorId)} title="Autor" />
                {of.revisorId && (
                  <>
                    <span className="text-text-muted">→</span>
                    <Avatar op={operarios.find((o) => o.id === of.revisorId)} title="Revisor" />
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        {estado === "devuelta" && ofs.find((o) => o.observacion) && (
          <p className="mt-1.5 rounded bg-red-500/10 px-1.5 py-1 text-[10px] text-red-600 dark:text-red-400">
            ⚠ {ofs.find((o) => o.observacion)?.observacion}
          </p>
        )}
      </button>

      {/* acciones por columna */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {estado === "por_revisar" && (
          <>
            <div className="flex w-full items-center gap-1.5 text-[11px] text-text-muted">
              Revisor:
              <Select
                value={revisorComun}
                onChange={(v) => setRevisorTodas(v)}
                placeholder="Asignar…"
                alignRight
                className="ml-auto"
                options={operarios
                  .filter((o) => !autores.has(o.id))
                  .map((o) => ({
                    value: o.id,
                    label: o.id === miId ? `${o.nombre} (tú)` : o.nombre,
                    icon: <OpDot color={o.color} iniciales={o.iniciales} />,
                  }))}
              />
            </div>
            {todasConRevisor && (
              <button
                onClick={() => accionTodas("empezar_revision")}
                title="Pasa a En revisión y arranca el fichaje del revisor"
                className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700"
              >
                Empezar revisión
              </button>
            )}
          </>
        )}
        {estado === "en_revision" && (
          <>
            <button
              onClick={() => pedirConfirmacion(defAprobar)}
              className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700"
            >
              Aprobar
            </button>
            <DevolverInline onDevolver={(obs) => accionTodas("devolver", obs)} />
            {dialogo}
          </>
        )}
        {estado === "aprobada" && (
          <span className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400">✓ Lista para Producción</span>
        )}
        {estado === "devuelta" && (
          <span className="text-[11px] text-text-muted">↩ Vuelve al autor</span>
        )}
      </div>
    </div>
  );
}
