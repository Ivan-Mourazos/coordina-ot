"use client";

import { memo, useState, type CSSProperties } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { Operario, Rol } from "@/lib/types";
import { dragIdOf, type Facet } from "./PedidoCard";
import { LiveDot } from "./LiveBadge";
import { ROL } from "@/lib/estado";
import { PedidoScan } from "./PedidoScan";
import { Select, OpDot } from "./Select";
import { useConfirmacion } from "./ConfirmDialog";
import { accionesDisponibles, type AccionDef, type AccionOF } from "@/lib/acciones";
import { esFichable, rolFichajeDe } from "@/lib/fichaje";

/** Ficha compacta de un pedido dentro del panel de un técnico. Muestra lo
 *  mínimo para identificarlo (código, cliente, nº de OF) y abre el detalle
 *  al clic; el estado ya lo da la columna donde vive. Arrastrable para
 *  reasignar, igual que la tarjeta grande. Los botones de acción salen de
 *  la máquina de estados (lib/acciones.ts): máx. 2 primarias + fichar; el
 *  resto (neutras/peligro, como anular o devolver) solo vive en el Drawer. */
export const PedidoChip = memo(function PedidoChip({
  facet,
  operarios,
  onOpen,
  onAccion,
  onFichar,
  onDesfichar,
  setRevisor,
  completarPedido,
  bucket,
  raised = false,
}: {
  facet: Facet;
  operarios: Operario[];
  onOpen: (f: Facet) => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  setRevisor: (ofId: string, revisorId: string | null) => void;
  completarPedido?: (pedidoId: string) => void;
  bucket?: "sinEmpezar" | "planteando" | "revision" | "finalizado";
  raised?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [terminando, setTerminando] = useState(false);
  const [revisorSelect, setRevisorSelect] = useState<string | null>(null);
  const { pedido, ofs } = facet;
  const total = pedido.ofs.length;
  const parcial = ofs.length < total;
  const ofIds = ofs.map((o) => o.id);

  // Unión de acciones disponibles sobre las OFs del facet, solo tono
  // "primaria" (neutras/peligro viven en el Drawer), máx. 2.
  const acciones: AccionDef[] = [];
  const vistas = new Set<AccionOF>();
  for (const of of ofs) {
    for (const a of accionesDisponibles(of)) {
      if (a.tono === "primaria" && !vistas.has(a.id)) {
        vistas.add(a.id);
        acciones.push(a);
      }
    }
  }
  const accionesChip = acciones.slice(0, 2);
  const { pedirConfirmacion, dialogo } = useConfirmacion((a) => onAccion(ofIds, a.id));

  const fichando = ofs.find((o) => o.fichandoRol);
  const fichandoOfs = ofs.filter((o) => o.fichandoRol);
  // El motor de fichaje mantiene UN solo intervalo abierto con UN rol: no se
  // puede fichar plantear y revisar a la vez (una segunda llamada a onFichar
  // con otro rol REEMPLAZARÍA el conjunto anterior). Se ficha solo el grupo
  // de rol coherente con el bucket; las OFs del otro rol se fichan desde el
  // drawer, OF por OF.
  const elegiblesFichar = ofs.filter(esFichable);
  const grupoPlantear = elegiblesFichar.filter((o) => rolFichajeDe(o) === "plantear");
  const grupoRevisar = elegiblesFichar.filter((o) => rolFichajeDe(o) === "revisar");
  const [grupoPref, grupoAlt] =
    bucket === "revision" ? [grupoRevisar, grupoPlantear] : [grupoPlantear, grupoRevisar];
  const grupoFichar = grupoPref.length > 0 ? grupoPref : grupoAlt;
  const rolFichar: Rol = grupoFichar.length > 0 ? rolFichajeDe(grupoFichar[0]) : "plantear";
  const excluidasPorRol = elegiblesFichar.length - grupoFichar.length;
  const revisorId = ofs.find((o) => o.revisorId)?.revisorId ?? null;
  const revisor = operarios.find((o) => o.id === revisorId) ?? null;
  const atrasado = Boolean(facet.atrasado);
  const accent =
    bucket === "planteando"
      ? "#059669"
      : bucket === "revision"
        ? "#f59e0b"
        : bucket === "finalizado"
          ? "#0d9488"
          : "#9ca3af";

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragIdOf(facet),
    data: { facet },
  });

  return (
    <div
      ref={setNodeRef}
      style={raised ? ({ "--pedido-accent": accent } as CSSProperties) : undefined}
      className={`group flex w-full flex-col overflow-hidden rounded-lg focus-within:ring-2 focus-within:ring-brand-400 ${
        raised
          ? `pedido-chip-3d ${expanded ? "pedido-chip-3d-open" : ""}`
          : "glass-chip transition-shadow"
      } ${
        isDragging ? "opacity-30" : ""
      } ${atrasado ? "ring-1 ring-red-500/70" : ""}`}
    >
      <div
        {...attributes}
        {...listeners}
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((x) => !x);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((x) => !x);
          }
        }}
        className="flex w-full cursor-grab items-center gap-2 px-2.5 py-2 text-left active:cursor-grabbing focus:outline-none"
      >
        {fichando?.fichandoRol && (
          <span title={`${ROL[fichando.fichandoRol].label} ahora`} className="inline-flex shrink-0">
            <LiveDot rol={fichando.fichandoRol} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`truncate text-xs font-semibold leading-tight ${
                atrasado ? "text-red-600" : "text-text"
              }`}
            >
              {pedido.codigo}
            </span>
            {atrasado && (
              <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-red-600">
                ¡Tarde!
              </span>
            )}
          </div>
          <div className="truncate text-[10px] leading-tight text-text-muted">
            {pedido.cliente}
          </div>
          <div className="mt-0.5 truncate text-[10px] italic text-text-muted/80">
            {ofs.map((o) => o.descripcion).join(" · ")}
          </div>
        </div>

        {revisor && (
          <span
            className="grid size-5 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
            style={{ background: revisor.color }}
            title={`Revisa: ${revisor.nombre}`}
          >
            {revisor.iniciales}
          </span>
        )}

        <span className="shrink-0 rounded-md bg-[var(--glass-highlight)] px-1.5 py-0.5 text-[9px] font-semibold text-text-muted">
          {parcial ? `${ofs.length}/${total}` : total} OF
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

      {expanded && (
        <div className="border-t border-[var(--glass-border)] bg-[var(--glass-highlight)] p-2.5 cursor-default">
          <div className="flex gap-3">
            <div
              className="aspect-[210/297] w-16 shrink-0 overflow-hidden rounded bg-white shadow-sm ring-1 ring-black/10 cursor-pointer hover:ring-brand-400 transition-shadow"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(facet);
              }}
              title="Ver detalle del pedido"
            >
              <PedidoScan pedido={pedido} />
            </div>

            <div className="flex flex-1 flex-col gap-2">
              {ofs.map((of) => {
                const autor = operarios.find((x) => x.id === of.autorId);
                const rev = operarios.find((x) => x.id === of.revisorId);
                let infoEstado = "Sin empezar";
                if (of.estado === "en_curso" && autor) infoEstado = `Planteando`;
                else if (of.estado === "en_revision" && rev) infoEstado = `Revisando`;
                else if (of.estado === "aprobada") infoEstado = "Finalizada";
                else if (of.estado === "por_revisar") infoEstado = "Para revisar";

                return (
                  <div key={of.id} className="flex items-center justify-between gap-2 text-[10px] leading-tight group/of">
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="font-semibold text-text truncate">
                        {of.codigo} - {of.descripcion}
                      </span>
                      <div className="flex items-center gap-1 text-text-muted truncate">
                        {of.fichandoRol && <LiveDot rol={of.fichandoRol} className="size-1.5 shrink-0" />}
                        <span>{infoEstado}</span>
                        {of.tiempoPlanteoMin > 0 && <span>· Plant: {of.tiempoPlanteoMin}m</span>}
                        {of.tiempoRevisionMin > 0 && <span>· Rev: {of.tiempoRevisionMin}m</span>}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0">
                      {autor && (
                        <div className="size-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white shadow-sm ring-1 ring-black/10" style={{ background: autor.color }} title={`Plantea: ${autor.nombre}`}>
                          {autor.iniciales}
                        </div>
                      )}
                      {rev && (
                        <div className="size-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white shadow-sm ring-1 ring-black/10" style={{ background: rev.color }} title={`Revisa: ${rev.nombre}`}>
                          {rev.iniciales}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-[var(--glass-border)] pt-2">
                {accionesChip.map((a) =>
                  a.id === "terminar_planteo" ? (
                    !terminando && (
                      <button
                        key={a.id}
                        onClick={(e) => { e.stopPropagation(); setTerminando(true); }}
                        className="rounded bg-teal-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-teal-700"
                      >
                        {a.label}
                      </button>
                    )
                  ) : (
                    <button
                      key={a.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        pedirConfirmacion(a);
                      }}
                      className="rounded bg-teal-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-teal-700"
                    >
                      {a.label}
                    </button>
                  ),
                )}

                {/* Selector de revisor al terminar planteo: se conserva tal cual
                    (afecta a todas las OFs del facet). Se fija el revisor ANTES
                    de ejecutar la acción; terminar_planteo no tiene `requiere`,
                    así que el orden no afecta al filtro de aplicables del Board. */}
                {terminando && (
                  <div className="flex w-full items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] text-text-muted">Revisor:</span>
                    <div className="flex-1">
                      <Select
                        value={revisorSelect}
                        onChange={setRevisorSelect}
                        options={operarios.filter(o => o.id !== facet.locationId).map(o => ({ value: o.id, label: o.nombre, icon: <OpDot color={o.color} iniciales={o.iniciales} /> }))}
                        placeholder="Elegir..."
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (revisorSelect) {
                          ofIds.forEach((id) => setRevisor(id, revisorSelect));
                          onAccion(ofIds, "terminar_planteo");
                          setTerminando(false);
                          setRevisorSelect(null);
                        }
                      }}
                      disabled={!revisorSelect}
                      className="rounded bg-teal-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => setTerminando(false)}
                      className="rounded bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-text hover:bg-surface-3"
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {bucket === "revision" && accionesChip.length === 0 && (
                  <span className="rounded bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                    Esperando revisión del compañero
                  </span>
                )}

                {fichandoOfs.length > 0 ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      fichandoOfs.forEach((o) => onDesfichar(o.id));
                    }}
                    className="rounded border border-border px-2.5 py-1 text-[10px] font-semibold text-text-muted hover:text-text"
                  >
                    ⏸ Dejar de fichar
                  </button>
                ) : (
                  grupoFichar.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFichar(grupoFichar.map((o) => o.id), rolFichar);
                      }}
                      title={
                        excluidasPorRol > 0
                          ? `Ficha ${grupoFichar.length} OF como ${ROL[rolFichar].label.toLowerCase()}; las otras ${excluidasPorRol} (otro rol) se fichan desde el detalle`
                          : undefined
                      }
                      className="rounded border border-border px-2.5 py-1 text-[10px] font-semibold text-text-muted hover:text-text"
                    >
                      ⏱ Fichar{excluidasPorRol > 0 ? ` (${grupoFichar.length})` : ""}
                    </button>
                  )
                )}

                {bucket === "finalizado" && completarPedido && (
                  <button
                    onClick={(e) => { e.stopPropagation(); completarPedido(pedido.id); }}
                    className="rounded bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700"
                  >
                    📦 Pasar a Producción (Completar)
                  </button>
                )}

                <button
                  onClick={(e) => { e.stopPropagation(); onOpen(facet); }}
                  className="ml-auto rounded bg-white/50 px-2 py-1 text-[10px] font-semibold hover:bg-white/80 dark:bg-black/20 dark:hover:bg-black/40"
                >
                  Abrir detalles ↗
                </button>

                {dialogo}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
