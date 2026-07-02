"use client";

import type { Operario, Pedido } from "@/lib/types";
import { estaFinalizado, tiempoTotalOF, tiempoTotalPedido } from "@/lib/types";
import { fmtMin } from "@/lib/estado";
import { FamiliaTag } from "./FamiliaTag";

function fmt(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
}

function Avatar({ op, title }: { op: Operario | undefined; title: string }) {
  if (!op)
    return <span className="text-text-muted italic">—</span>;
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
  const hechos = pedidos.filter(estaFinalizado);

  if (hechos.length === 0) {
    return (
      <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border text-sm text-text-muted">
        Aún no hay pedidos finalizados que coincidan con el filtro.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        {hechos.length} pedido(s) finalizados y enviados a Producción. Registro de quién lo
        hizo, tiempos y archivos del planteamiento subidos a RPS.
      </p>
      {hechos.map((p) => (
        <div key={p.id} className="overflow-hidden rounded-xl border border-border bg-surface">
          {/* cabecera */}
          <button
            onClick={() => onOpen(p)}
            className="flex w-full items-center gap-3 border-b border-border bg-surface-2/50 px-4 py-2.5 text-left hover:bg-surface-2"
          >
            <span className="size-2.5 rounded-full bg-teal-600" />
            <span className="font-semibold text-text">{p.codigo}</span>
            <span className="text-sm text-text-muted">{p.cliente}</span>
            <span className="ml-auto flex items-center gap-3 text-xs text-text-muted">
              <span>Planif. {fmt(p.fechaPlanificacion)}</span>
              <span>Entrega {fmt(p.fechaEntrega)}</span>
              <span className="rounded bg-surface px-2 py-0.5 font-semibold text-text ring-1 ring-border">
                Total {fmtMin(tiempoTotalPedido(p))}
              </span>
            </span>
          </button>

          {/* OFs */}
          <ul className="divide-y divide-border">
            {p.ofs.map((of) => (
              <li key={of.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
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
                  <span className="text-text-muted">
                    Revisión <b className="text-violet-600 dark:text-violet-400">{fmtMin(of.tiempoRevisionMin)}</b>
                  </span>
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-text ring-1 ring-border">
                    {fmtMin(tiempoTotalOF(of))}
                  </span>
                </div>

                {/* archivos RPS */}
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  {of.archivosRps?.map((a) => (
                    <span
                      key={a}
                      className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] text-text-muted"
                      title="Archivo en RPS"
                    >
                      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                      </svg>
                      {a}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
