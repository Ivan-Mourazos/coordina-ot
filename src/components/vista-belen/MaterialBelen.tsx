"use client";

import { estadoMaterial, type EstadoMaterial } from "@/lib/types";
import { enFrase, fechaCorta, type MaterialPedido } from "@/lib/vista-belen";
import { AcentoBloque, type TipoBloque } from "../AcentoBloque";
import { SIGNIFICA } from "./significados";

// ─── Material del pedido, en la pantalla de Belén ────────────────────────────
// Por OF, las tres manos del material: lo que OT ASIGNÓ (y cuánto ha
// RESERVADO Almacén de eso) y, aparte, lo que Compras PIDIÓ para la OF, con
// cuándo y si ha llegado. Van separados porque en RPS no encadenan: lo que se
// compra para una OF casi nunca es lo asignado (tubo, lacado, portes).
//
// Arriba de cada OF, de un vistazo: cuántas líneas están reservadas (con su
// barra) y cuántas compras faltan por llegar.

const ESTADO: Record<EstadoMaterial, { texto: string; clase: string; barra: string }> = {
  reservado: {
    texto: "Reservado",
    clase: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300",
    barra: "bg-emerald-500",
  },
  aMedias: {
    texto: "A medias",
    clase: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
    barra: "bg-amber-500",
  },
  sinReservar: {
    texto: "Sin reservar",
    clase: "bg-red-500/12 text-red-800 dark:text-red-300",
    barra: "bg-red-500",
  },
};

/** «3,2» y no «3.2000»: las cantidades de RPS vienen con cuatro decimales. */
const cantidad = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 2 });

function estadoCompra(c: { pedida: number; recibida: number; estimada?: string }, hoy: string) {
  if (c.recibida >= c.pedida) return { texto: "Recibido", clase: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300" };
  if (c.estimada && c.estimada < hoy) return { texto: "Atrasado", clase: "bg-red-500/12 text-red-800 dark:text-red-300" };
  if (c.recibida > 0) return { texto: "En parte", clase: "bg-amber-500/15 text-amber-900 dark:text-amber-200" };
  return { texto: "Pendiente", clase: "bg-amber-500/15 text-amber-900 dark:text-amber-200" };
}

const Th = ({ children, derecha = false, ayuda }: { children: React.ReactNode; derecha?: boolean; ayuda?: string }) => (
  <th
    scope="col"
    title={ayuda}
    className={`pb-1 pr-3 text-[11px] font-semibold text-text-muted ${derecha ? "text-right" : "text-left"} ${
      ayuda ? "cursor-help underline decoration-dotted decoration-text-muted/60 underline-offset-2" : ""
    }`}
  >
    {children}
  </th>
);

function Cabecera({ tipo, children, derecha }: { tipo: TipoBloque; children: React.ReactNode; derecha?: React.ReactNode }) {
  return (
    <div data-bloque={tipo} className="cabecera-bloque mb-1.5 mt-3 flex items-center gap-1.5 text-[12px] font-semibold first:mt-0">
      <AcentoBloque tipo={tipo} />
      {children}
      {derecha && <span className="ml-auto font-medium text-text-muted">{derecha}</span>}
    </div>
  );
}

export function MaterialBelen({ material }: { material: MaterialPedido }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const conAlgo = material.ofs.filter((o) => o.materiales.length || o.compras.length);
  if (!conAlgo.length) {
    return (
      <p className="tarjeta-of rounded-3xl bg-surface px-5 py-4 text-sm text-text-muted">
        Ninguna OF de este pedido tiene material asignado ni compras en RPS.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {conAlgo.map((o) => {
        const estados = o.materiales.map(estadoMaterial);
        const reservadas = estados.filter((e) => e === "reservado").length;
        const porLlegar = o.compras.filter((c) => c.recibida < c.pedida).length;
        return (
          <section key={o.of} aria-label={`Material de la OF ${o.of}`} className="tarjeta-of rounded-3xl bg-surface px-5 py-4">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-[15px] font-bold">{o.of}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{enFrase(o.descripcion)}</span>
              {o.materiales.length > 0 && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold tabular-nums ${
                    reservadas === o.materiales.length ? ESTADO.reservado.clase : reservadas === 0 ? ESTADO.sinReservar.clase : ESTADO.aMedias.clase
                  }`}
                >
                  {reservadas} de {o.materiales.length} reservados
                </span>
              )}
              {porLlegar > 0 && (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[12px] font-bold text-amber-900 dark:text-amber-200">
                  {porLlegar} {porLlegar === 1 ? "compra" : "compras"} por llegar
                </span>
              )}
            </header>

            {o.materiales.length > 0 && (
              <>
                {/* Una rayita por línea de material, en el color de su estado. */}
                <div className="mt-2.5 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                  {estados.map((e, i) => (
                    <span key={i} className={`flex-1 ${ESTADO[e].barra}`} />
                  ))}
                </div>
                <Cabecera tipo="ofs">Asignado por OT y reservado por Almacén</Cabecera>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      <Th>Material</Th>
                      <Th derecha ayuda={SIGNIFICA.asignado}>
                        Asignado
                      </Th>
                      <Th derecha ayuda={SIGNIFICA.reservado}>
                        Reservado
                      </Th>
                      <Th>Estado</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.materiales.map((m, i) => {
                      const e = ESTADO[estadoMaterial(m)];
                      return (
                        <tr key={i} className="border-b border-border transition-colors last:border-b-0 hover:bg-[var(--detalle)]">
                          <td className="py-1.5 pr-3">{enFrase(m.descripcion)}</td>
                          <td className="w-24 py-1.5 pr-3 text-right tabular-nums">{cantidad(m.cantidad)}</td>
                          <td className="w-24 py-1.5 pr-3 text-right font-semibold tabular-nums">{cantidad(m.reservada)}</td>
                          <td className="w-32 py-1.5">
                            <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${e.clase}`}>{e.texto}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}

            <Cabecera tipo="recorrido" derecha={o.compras.length ? `${o.compras.length} ${o.compras.length === 1 ? "línea" : "líneas"}` : undefined}>
              <span
                title={SIGNIFICA.pedidoProveedor}
                className="cursor-help underline decoration-dotted decoration-text-muted/60 underline-offset-2"
              >
                Pedido a proveedor
              </span>
            </Cabecera>
            {o.compras.length ? (
              <table className="w-full text-[13px]">
                <thead>
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
                      <tr key={i} className="border-b border-border transition-colors last:border-b-0 hover:bg-[var(--detalle)]">
                        <td className="py-1.5 pr-3">{enFrase(c.articulo)}</td>
                        <td className="max-w-[14rem] truncate py-1.5 pr-3 text-text-muted" title={c.proveedor}>
                          {enFrase(c.proveedor)}
                        </td>
                        <td className="w-24 py-1.5 pr-3 tabular-nums text-text-muted">{fechaCorta(c.fechaPedido)}</td>
                        <td className="w-28 py-1.5 pr-3 text-right tabular-nums">
                          <b className="font-semibold">{cantidad(c.recibida)}</b> de {cantidad(c.pedida)}
                        </td>
                        <td className="w-24 py-1.5 pr-3 font-semibold tabular-nums">{fechaCorta(c.estimada)}</td>
                        <td className="w-28 py-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${e.clase}`}>{e.texto}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-[12.5px] text-text-muted">Nada pedido a proveedor para esta OF.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
