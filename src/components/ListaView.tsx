"use client";

import { Fragment, useState } from "react";
import type { OF, Operario, Pedido } from "@/lib/types";
import { estaAtrasado, familiasDe, hoyISO, tiempoTotalOF } from "@/lib/types";
import { ESTADO, PRIORIDAD, estadoRepresentativo, fmtMin } from "@/lib/estado";
import { FamiliaTag, FamiliaIcon } from "./FamiliaTag";
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
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-text-muted">
            <Th className="w-8" />
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
            const abierto = expandidos.has(p.id);
            return (
              <Fragment key={p.id}>
                <tr
                  onClick={() => toggle(p.id)}
                  aria-expanded={abierto}
                  className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface-2 ${
                    pendienteProc ? "opacity-60" : ""
                  } ${abierto ? "bg-surface-2" : ""}`}
                >
                  <Td>
                    <svg
                      viewBox="0 0 24 24"
                      className={`size-3.5 text-text-muted transition-transform ${abierto ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3.5 w-1 rounded-full"
                        style={{ background: PRIORIDAD[p.prioridad].color }}
                        title={`Prioridad ${PRIORIDAD[p.prioridad].label}`}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(p);
                        }}
                        className={`font-mono font-semibold hover:underline ${atrasado ? "text-red-600" : "text-text"}`}
                        title="Abrir detalle del pedido"
                      >
                        {p.codigo}
                      </button>
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
                {abierto && (
                  <tr className="border-b border-border last:border-0 bg-surface-2/60">
                    <td colSpan={11} className="px-3 py-2.5">
                      <ul className="space-y-1.5">
                        {p.ofs.map((of) => (
                          <OFRowLista key={of.id} of={of} operarios={operarios} />
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OFRowLista({ of, operarios }: { of: OF; operarios: Operario[] }) {
  const meta = ESTADO[of.estado];
  const autor = operarios.find((o) => o.id === of.autorId);
  const revisor = operarios.find((o) => o.id === of.revisorId);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface px-2.5 py-1.5 text-[11px] ring-1 ring-border">
      <FamiliaIcon familia={of.familia} className="size-3.5 shrink-0" />
      <span className="font-mono font-semibold text-text">{of.codigo}</span>
      <span className="truncate text-text">{of.descripcion}</span>
      {of.fichandoRol && (
        <span title={of.fichandoRol === "revisar" ? "Revisando ahora" : "Planteando ahora"} className="inline-flex">
          <LiveDot rol={of.fichandoRol} />
        </span>
      )}
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${meta.chip}`}>
        {meta.label}
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        <Avatar op={autor} title="Autor" />
        <span className="text-text-muted">→</span>
        <Avatar op={revisor} title="Revisor" />
      </span>
      <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-text ring-1 ring-border">
        {fmtMin(tiempoTotalOF(of))}
      </span>
    </li>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 font-semibold ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 ${className}`}>{children}</td>;
}
