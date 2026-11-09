"use client";

import { estadoMaterial, type EstadoMaterial } from "@/lib/types";
import { enFrase, fechaCorta, type MaterialPedido } from "@/lib/vista-belen";
import { SIGNIFICA } from "./AyudaBelen";

// ─── Material del pedido, en la pantalla de Belén ────────────────────────────
// Por OF, las tres manos del material: lo que OT ASIGNÓ (y cuánto ha
// RESERVADO Almacén de eso) y, aparte, lo que Compras PIDIÓ para la OF, con
// cuándo y si ha llegado. Van separados porque en RPS no encadenan: lo que se
// compra para una OF casi nunca es lo asignado (tubo, lacado, portes).

const ESTADO: Record<EstadoMaterial, { texto: string; clase: string }> = {
  reservado: { texto: "Reservado", clase: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300" },
  aMedias: { texto: "Reservado a medias", clase: "bg-amber-500/15 text-amber-900 dark:text-amber-200" },
  sinReservar: { texto: "Sin reservar", clase: "bg-red-500/12 text-red-800 dark:text-red-300" },
};

/** «3,2» y no «3.2000»: las cantidades de RPS vienen con cuatro decimales. */
const cantidad = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 2 });

function estadoCompra(c: { pedida: number; recibida: number; estimada?: string }, hoy: string) {
  if (c.recibida >= c.pedida) return { texto: "Recibido", clase: "text-emerald-700 dark:text-emerald-300" };
  if (c.estimada && c.estimada < hoy) return { texto: "Atrasado", clase: "text-red-700 dark:text-red-300" };
  if (c.recibida > 0) return { texto: "Recibido en parte", clase: "text-amber-700 dark:text-amber-300" };
  return { texto: "Pendiente", clase: "text-amber-700 dark:text-amber-300" };
}

const Th = ({ children, derecha = false, ayuda }: { children: React.ReactNode; derecha?: boolean; ayuda?: string }) => (
  <th
    scope="col"
    title={ayuda}
    className={`py-1 pr-3 font-semibold ${derecha ? "text-right" : "text-left"} ${ayuda ? "cursor-help" : ""}`}
  >
    {children}
  </th>
);

export function MaterialBelen({ material }: { material: MaterialPedido }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const conAlgo = material.ofs.filter((o) => o.materiales.length || o.compras.length);
  if (!conAlgo.length) {
    return (
      <p className="px-1 text-sm text-text-muted">
        Ninguna OF de este pedido tiene material asignado ni compras en RPS.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {conAlgo.map((o) => (
        <section key={o.of} aria-label={`Material de la OF ${o.of}`} className="tarjeta-of rounded-3xl bg-surface px-5 py-3">
          <header className="flex items-baseline gap-3">
            <span className="font-mono text-[14px] font-bold">{o.of}</span>
            <span className="min-w-0 truncate text-[13px] text-text-muted">{enFrase(o.descripcion)}</span>
          </header>

          <h3 className="mt-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Asignado por OT y reservado por Almacén
          </h3>
          {o.materiales.length ? (
            <table className="mt-1 w-full text-[13px]">
              <thead className="text-[11px] text-text-muted">
                <tr className="border-b border-border">
                  <Th>Material</Th>
                  <Th derecha ayuda={SIGNIFICA.asignado}>Asignado</Th>
                  <Th derecha ayuda={SIGNIFICA.reservado}>Reservado</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {o.materiales.map((m, i) => {
                  const e = ESTADO[estadoMaterial(m)];
                  return (
                    <tr key={i} className="border-b border-border last:border-b-0">
                      <td className="py-1 pr-3">{enFrase(m.descripcion)}</td>
                      <td className="w-24 py-1 pr-3 text-right tabular-nums">{cantidad(m.cantidad)}</td>
                      <td className="w-24 py-1 pr-3 text-right tabular-nums">{cantidad(m.reservada)}</td>
                      <td className="w-40 py-1">
                        <span className={`rounded-full px-2 py-px text-[11.5px] font-semibold ${e.clase}`}>{e.texto}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="mt-1 text-[12.5px] text-text-muted">Sin material asignado.</p>
          )}

          <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Pedido a proveedor</h3>
          {o.compras.length ? (
            <table className="mt-1 w-full text-[13px]">
              <thead className="text-[11px] text-text-muted">
                <tr className="border-b border-border">
                  <Th>Artículo</Th>
                  <Th>Proveedor</Th>
                  <Th>Pedido el</Th>
                  <Th derecha>Recibido</Th>
                  <Th>Llega</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {o.compras.map((c, i) => {
                  const e = estadoCompra(c, hoy);
                  return (
                    <tr key={i} className="border-b border-border last:border-b-0">
                      <td className="py-1 pr-3">{enFrase(c.articulo)}</td>
                      <td className="max-w-[14rem] truncate py-1 pr-3 text-text-muted" title={c.proveedor}>
                        {enFrase(c.proveedor)}
                      </td>
                      <td className="w-24 py-1 pr-3 tabular-nums">{fechaCorta(c.fechaPedido)}</td>
                      <td className="w-28 py-1 pr-3 text-right tabular-nums">
                        {cantidad(c.recibida)} de {cantidad(c.pedida)}
                      </td>
                      <td className="w-24 py-1 pr-3 tabular-nums">{fechaCorta(c.estimada)}</td>
                      <td className={`w-32 py-1 text-[12px] font-semibold ${e.clase}`}>{e.texto}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="mt-1 text-[12.5px] text-text-muted">Nada pedido a proveedor para esta OF.</p>
          )}
        </section>
      ))}
    </div>
  );
}
