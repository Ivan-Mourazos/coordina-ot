import { enFrase, fechaCorta, type LineaAlmacen } from "@/lib/vista-belen";
import { chip, FECHA } from "./estilos-belen";

// ─── Hoja de almacén: las líneas con «Pedido almacén» marcado ────────────────
// Van encima de las OF del pedido, si las hay; sin OF, son todo el pedido.
// Belén (16/11/2026): «no es una OF, es hoja de almacén; como aparece en Apryl,
// sin complicarnos». Una fila por línea: punto verde si Almacén ya hizo el
// traspaso, rojo si no; unidades y artículo, forma de entrega y solicitada.

const num = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 3 });

export function HojaAlmacenBelen({ lineas }: { lineas: LineaAlmacen[] }) {
  return (
    <div className="tarjeta-of overflow-hidden rounded-3xl bg-surface">
      <p className="px-5 pt-3 text-[12px] font-semibold uppercase tracking-wide text-text-muted">Hoja de almacén</p>
      <ul className="divide-y divide-border">
        {lineas.map((l) => {
          const hecha = l.traspasadas > 0;
          const aMedias = hecha && l.traspasadas < l.cantidad;
          const estado = hecha ? "Hecha: Almacén hizo el traspaso" : "Sin hacer: Almacén aún no hizo el traspaso";
          return (
            <li key={l.linea} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
              <span role="img" aria-label={estado} title={estado} className={`size-3 shrink-0 rounded-sm ${hecha ? "bg-emerald-500" : "bg-red-500"}`} />
              <span className="min-w-[10rem] flex-1 text-[13.5px] font-medium" title={`${num(l.cantidad)} × ${l.articulo}`}>
                <b className="mr-1.5 font-bold tabular-nums">{num(l.cantidad)} ×</b>
                {enFrase(l.articulo)}
              </span>
              {aMedias && (
                <span className={chip("aviso")} title="Almacén traspasó menos de lo pedido">
                  traspasadas {num(l.traspasadas)} de {num(l.cantidad)}
                </span>
              )}
              {l.formaEntrega && <span className="max-w-[14rem] truncate text-[12.5px] text-text-muted">{enFrase(l.formaEntrega)}</span>}
              {l.fechaSolicitada && (
                <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                  <span className="text-[11px] font-medium text-text-muted">{FECHA.solicitada.rotulo}</span>
                  <b className={`text-[13px] font-bold tabular-nums ${FECHA.solicitada.tinta}`}>{fechaCorta(l.fechaSolicitada)}</b>
                </span>
              )}
              <span className={chip(hecha ? "ok" : "error")}>{hecha ? "Hecha" : "Sin hacer"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
