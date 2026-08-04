"use client";

import { useState } from "react";
import type { EstadoOF, Operario, Pedido } from "@/lib/types";
import { ESTADO } from "@/lib/estado";
import { FASES } from "@/lib/fases-tablero";
import { ACCIONES, type AccionOF } from "@/lib/acciones";
import { facetsRevisorEnEstado, type FacetRevision as RFacet } from "@/lib/revision";
import { FamiliaIcon } from "./FamiliaTag";
import { LiveDot } from "./LiveBadge";
import { DevolverInline } from "./DevolverInline";
import { useConfirmacion } from "./ConfirmDialog";
import { Select, OpDot } from "./Select";

const COLUMNAS: { estado: EstadoOF; titulo: string }[] = [
  { estado: "por_revisar", titulo: "Por revisar" },
  { estado: "en_revision", titulo: "En revisión" },
  { estado: "aprobada", titulo: "Aprobadas" },
  { estado: "devuelta", titulo: "Devueltas" },
];

// Vista por defecto: solo lo mío como revisor. Mismos estados que arriba
// salvo "aprobada" (ya no es acción mía: pasó a Producción) y con nombres
// que se leen desde MI lado, no desde el del autor.
const COLUMNAS_MIAS: { estado: EstadoOF; titulo: string }[] = [
  { estado: "por_revisar", titulo: "Por empezar" },
  { estado: "en_revision", titulo: "Revisando" },
  { estado: "devuelta", titulo: "Devueltas por mí" },
];

// La fase de revisión es violeta (#7c3aed) en toda la app: se reutiliza el
// color de FASES en vez de definir uno propio para estas columnas.
const FASE_REVISION = FASES.find((f) => f.id === "esperandoRevision")!;

const ALCANCE_KEY = "coordina-revision-alcance";
type Alcance = "mias" | "equipo";

function leerAlcanceGuardado(): Alcance {
  if (typeof window === "undefined") return "mias";
  try {
    return localStorage.getItem(ALCANCE_KEY) === "equipo" ? "equipo" : "mias";
  } catch {
    return "mias";
  }
}

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
  // Inicializador perezoso (no setState síncrono en efecto): mismo patrón
  // que Board.tsx usa para leer la identidad guardada.
  const [alcance, setAlcanceState] = useState<Alcance>(leerAlcanceGuardado);
  const setAlcance = (a: Alcance) => {
    setAlcanceState(a);
    try {
      localStorage.setItem(ALCANCE_KEY, a);
    } catch {}
  };

  const facetsDe = (estado: EstadoOF): RFacet[] =>
    pedidos
      .map((p) => ({ pedido: p, ofs: p.ofs.filter((o) => o.estado === estado) }))
      .filter((f) => f.ofs.length > 0);

  const facetsMiasDe = (estado: EstadoOF): RFacet[] =>
    facetsRevisorEnEstado(pedidos, estado, miId);
  const totalMias = COLUMNAS_MIAS.reduce(
    (n, col) => n + facetsMiasDe(col.estado).reduce((m, f) => m + f.ofs.length, 0),
    0,
  );

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-sm font-semibold text-text">
          {alcance === "mias" ? "Lo que tengo que revisar" : "Revisión del equipo"}
        </h1>
        <AlcanceToggle alcance={alcance} onChange={setAlcance} />
      </div>

      {alcance === "equipo" ? (
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
            {COLUMNAS.map((col) => (
              <ColumnaRevision
                key={col.estado}
                titulo={col.titulo}
                estado={col.estado}
                dotClassName={ESTADO[col.estado].dot}
                facets={facetsDe(col.estado)}
                operarios={operarios}
                miId={miId}
                onOpen={onOpen}
                onSetRevisor={onSetRevisor}
                onAccion={onAccion}
              />
            ))}
          </div>
        </>
      ) : totalMias === 0 ? (
        <div className="grid min-h-32 place-items-center rounded-xl border border-dashed border-border bg-zone text-sm text-text-muted">
          No tienes nada pendiente de revisar.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {COLUMNAS_MIAS.map((col) => (
            <ColumnaRevision
              key={col.estado}
              titulo={col.titulo}
              estado={col.estado}
              dotColor={FASE_REVISION.color}
              facets={facetsMiasDe(col.estado)}
              operarios={operarios}
              miId={miId}
              onOpen={onOpen}
              onSetRevisor={onSetRevisor}
              onAccion={onAccion}
            />
          ))}
        </div>
      )}
    </>
  );
}

// Una columna del tablero de revisión: cabecera con punto de color + título +
// contador, y la lista de tarjetas (o el aviso de "Vacío"). La comparten la
// vista "Todo el equipo" (color por ESTADO, vía dotClassName) y "Solo mías"
// (color único de la fase de revisión, vía dotColor) para no duplicar el
// layout de la columna en dos sitios.
function ColumnaRevision({
  titulo,
  estado,
  dotClassName,
  dotColor,
  facets,
  operarios,
  miId,
  onOpen,
  onSetRevisor,
  onAccion,
}: {
  titulo: string;
  estado: EstadoOF;
  dotClassName?: string;
  dotColor?: string;
  facets: RFacet[];
  operarios: Operario[];
  miId: string | null;
  onOpen: (p: Pedido) => void;
  onSetRevisor: (ofId: string, revisorId: string | null) => void;
  onAccion: (ofId: string, accion: AccionOF, obs?: string) => void;
}) {
  const nOF = facets.reduce((n, f) => n + f.ofs.length, 0);
  return (
    <div className="flex flex-col rounded-xl border border-border bg-zone p-3">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`size-2.5 rounded-full ${dotClassName ?? ""}`}
          style={dotColor ? { background: dotColor } : undefined}
        />
        <h2 className="text-sm font-semibold text-text">{titulo}</h2>
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
              estado={estado}
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
}

function AlcanceToggle({
  alcance,
  onChange,
}: {
  alcance: Alcance;
  onChange: (a: Alcance) => void;
}) {
  const OPCIONES: { id: Alcance; label: string }[] = [
    { id: "mias", label: "Solo mías" },
    { id: "equipo", label: "Todo el equipo" },
  ];
  return (
    <div className="glass-chip inline-flex rounded-lg p-1" role="group" aria-label="Alcance de la vista de revisión">
      {OPCIONES.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={alcance === o.id}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            alcance === o.id
              ? "bg-violet-600 text-white shadow-sm"
              : "text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
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
