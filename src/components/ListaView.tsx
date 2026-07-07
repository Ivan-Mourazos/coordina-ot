"use client";

import type { Operario, Pedido } from "@/lib/types";
import { estaAtrasado, familiasDe, hoyISO, tiempoTotalOF } from "@/lib/types";
import { ESTADO, PRIORIDAD, estadoRepresentativo, fmtMin } from "@/lib/estado";
import { FamiliaTag } from "./FamiliaTag";
import { LiveDot } from "./LiveBadge";

function fmt(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

function Avatares({
  ids,
  operarios,
}: {
  ids: (string | null)[];
  operarios: Operario[];
}) {
  const unicos = [...new Set(ids.filter(Boolean) as string[])];
  if (unicos.length === 0) return <span className="text-text-muted">—</span>;
  return (
    <div className="flex -space-x-1.5">
      {unicos.map((id) => {
        const o = operarios.find((x) => x.id === id);
        if (!o) return null;
        return (
          <span
            key={id}
            className="grid size-5 place-items-center rounded-full text-[9px] font-bold text-white ring-2 ring-surface"
            style={{ background: o.color }}
            title={o.nombre}
          >
            {o.iniciales}
          </span>
        );
      })}
    </div>
  );
}

export function ListaView({
  pedidos,
  operarios,
  onOpen,
}: {
  pedidos: Pedido[];
  operarios: Operario[];
  onOpen: (p: Pedido) => void;
}) {
  const hoy = hoyISO();
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-text-muted">
            <Th>Pedido</Th>
            <Th>Cliente</Th>
            <Th>Familias</Th>
            <Th className="text-center">OF</Th>
            <Th>Autor(es)</Th>
            <Th>Revisor(es)</Th>
            <Th>Estado</Th>
            <Th>Planif.</Th>
            <Th>Entrega</Th>
            <Th className="text-right">Tiempo</Th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => {
            const rep = estadoRepresentativo(p.ofs);
            const meta = ESTADO[rep];
            const total = p.ofs.reduce((n, of) => n + tiempoTotalOF(of), 0);
            const atrasado = estaAtrasado(p, hoy);
            const pendienteProc = p.situacion === "pendiente";
            const fichando = p.ofs.find((o) => o.fichandoRol)?.fichandoRol ?? null;
            return (
              <tr
                key={p.id}
                onClick={() => onOpen(p)}
                className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface-2 ${
                  pendienteProc ? "opacity-60" : ""
                }`}
              >
                <Td>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3.5 w-1 rounded-full"
                      style={{ background: PRIORIDAD[p.prioridad].color }}
                      title={`Prioridad ${PRIORIDAD[p.prioridad].label}`}
                    />
                    <span className={`font-mono font-semibold ${atrasado ? "text-red-600" : "text-text"}`}>
                      {p.codigo}
                    </span>
                    {fichando && (
                      <span title={fichando === "revisar" ? "Revisando ahora" : "Planteando ahora"} className="inline-flex">
                        <LiveDot rol={fichando} />
                      </span>
                    )}
                    {atrasado && (
                      <span className="rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                        Atrasado
                      </span>
                    )}
                    {pendienteProc && (
                      <span className="rounded bg-gray-400 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white dark:bg-gray-600">
                        Sin procesar
                      </span>
                    )}
                  </div>
                </Td>
                <Td className="text-text">
                  {p.cliente}
                  {p.negocio && (
                    <span className="text-text-muted"> · {p.negocio}</span>
                  )}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {familiasDe(p).map((f) => (
                      <FamiliaTag key={f} familia={f} />
                    ))}
                  </div>
                </Td>
                <Td className="text-center font-medium text-text">{p.ofs.length}</Td>
                <Td>
                  <Avatares ids={p.ofs.map((o) => o.autorId)} operarios={operarios} />
                </Td>
                <Td>
                  <Avatares ids={p.ofs.map((o) => o.revisorId)} operarios={operarios} />
                </Td>
                <Td>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${meta.chip}`}>
                    {meta.label}
                  </span>
                </Td>
                <Td className={atrasado ? "font-semibold text-red-600" : "text-text-muted"}>
                  {fmt(p.fechaPlanificacion)}
                </Td>
                <Td className="text-text-muted">{fmt(p.fechaEntrega)}</Td>
                <Td className="text-right font-medium text-text">{fmtMin(total)}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 font-semibold ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 ${className}`}>{children}</td>;
}
