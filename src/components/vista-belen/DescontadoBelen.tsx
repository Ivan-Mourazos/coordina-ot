"use client";

import { enFrase, fechaCorta, type LineaDescontada, type OrigenDescuento } from "@/lib/vista-belen";
import { chip, type Tono } from "./estilos-belen";

// ─── Material descontado del pedido, en la pantalla de Belén ─────────────────
// Lo que salió de verdad para cada OF, se descontara en el almacén (PDA), desde
// Producción (OLANET) o a mano en RPS: la «Imputación de material» de RPS, un
// apunte por fila y con sus mismas columnas (Iván, 14/11/2026). No se casa con
// lo asignado de la pestaña Material: en RPS casi nunca van enlazados.

const ORIGEN: Record<OrigenDescuento, { texto: string; tono: Tono; ayuda: string }> = {
  almacen: { texto: "Almacén", tono: "info", ayuda: "Lo descontó el almacén con la PDA" },
  produccion: { texto: "Producción", tono: "ok", ayuda: "Lo descontaron en Producción desde OLANET" },
  rps: { texto: "RPS", tono: "neutro", ayuda: "Se apuntó a mano en RPS" },
};

/** «3,2» y no «3.2000»: las cantidades de RPS vienen con cuatro decimales. */
const cantidad = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 2 });

const Th = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <th scope="col" className={`pb-1 pr-3 text-left text-[11px] font-semibold text-text-muted ${className}`}>
    {children}
  </th>
);

export function DescontadoBelen({ lineas }: { lineas: LineaDescontada[] }) {
  if (!lineas.length) {
    return (
      <p className="tarjeta-of rounded-3xl bg-surface px-5 py-4 text-sm text-text-muted">
        Todavía no se ha descontado material para ninguna OF de este pedido.
      </p>
    );
  }
  const porOF = new Map<string, LineaDescontada[]>();
  for (const l of lineas) porOF.set(l.of, [...(porOF.get(l.of) ?? []), l]);
  return (
    <div className="flex flex-col gap-2">
      {[...porOF].map(([of, suyas]) => (
        <section key={of} aria-label={`Material descontado de la OF ${of}`} className="tarjeta-of rounded-3xl bg-surface px-5 py-4">
          <header className="mb-2 flex items-center gap-3">
            <span className="font-mono text-[15px] font-bold">{of}</span>
            <span className="ml-auto text-[12px] font-medium text-text-muted">
              {suyas.length} {suyas.length === 1 ? "apunte" : "apuntes"}
            </span>
          </header>
          <table className="w-full table-fixed text-[13px]">
            <caption className="sr-only">Material descontado de la OF {of}</caption>
            <thead>
              <tr className="border-b border-border">
                <Th className="w-[10.5rem]">Artículo</Th>
                <Th>Descripción</Th>
                <Th className="w-[7.5rem] text-right">Cantidad</Th>
                <Th className="w-[9rem]">Almacén</Th>
                <Th className="w-[11rem]">Operario</Th>
                <Th className="w-[5.5rem]">Fecha</Th>
                <Th className="w-[7.5rem]">Nº serie</Th>
                <Th className="w-[6.5rem] pr-0">Origen</Th>
              </tr>
            </thead>
            <tbody>
              {suyas.map((l, i) => {
                const o = ORIGEN[l.origen];
                return (
                  <tr key={i} className="border-b border-border align-top transition-colors last:border-b-0 hover:bg-[var(--detalle)]">
                    <td className="truncate py-1.5 pr-3 font-mono text-[12px]" title={l.articulo}>
                      {l.articulo || <span className="text-text-muted">—</span>}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className="block truncate" title={l.descripcion}>{enFrase(l.descripcion)}</span>
                      {l.comentario && (
                        <span className="block truncate text-[12px] text-text-muted" title={l.comentario}>
                          {l.comentario}
                        </span>
                      )}
                    </td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums ${l.cantidad < 0 ? "text-red-700 dark:text-red-300" : ""}`} title={l.cantidad < 0 ? "Devolución" : undefined}>
                      <b className="font-semibold">{cantidad(l.cantidad)}</b> <span className="text-text-muted">{l.unidad ?? ""}</span>
                    </td>
                    <td className="truncate py-1.5 pr-3" title={l.almacen ?? undefined}>
                      {l.almacen ? enFrase(l.almacen) : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="truncate py-1.5 pr-3" title={l.operario ?? undefined}>
                      {l.operario ?? <span className="text-text-muted">—</span>}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{fechaCorta(l.fecha) || <span className="text-text-muted">—</span>}</td>
                    <td className="truncate py-1.5 pr-3 font-mono text-[12px]" title={l.serie ?? undefined}>
                      {l.serie ?? <span className="text-text-muted">—</span>}
                    </td>
                    <td className="py-1.5">
                      <span title={o.ayuda} className={`${chip(o.tono)} cursor-help`}>{o.texto}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
