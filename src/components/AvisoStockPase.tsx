import type { VistaPlanteamiento } from "@/lib/planteamiento-textos";
import { cuando } from "@/lib/planteamiento-textos";
import { metrosCuenta, notaBobinas, resumenFalta, textoOFStock } from "@/lib/correo-stock";

type Stock = VistaPlanteamiento["stockLona"];
export const elegirCorreoStock = (s: Stock) => s?.faltas.some(f => !f.yaAvisado) ?? false;

export function AvisoLonaSinComprobar({ ofs = [] }: { ofs?: readonly string[] }) {
  return (
    <div role="status">
      {ofs.length > 0 && (
        <p className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          Sin comprobar el stock de lona: falta pasar el corte de la OF {ofs.join(", ")}.
        </p>
      )}
    </div>
  );
}

export function AvisoStockPase({ stock, marcado, onCambiar, modo }: {
  stock: Stock; marcado: boolean; onCambiar: (valor: boolean) => void;
  modo?: "ensayo" | "off" | "activo";
}) {
  if (!stock?.faltas.length) return null;
  // Si hay varios avisos, se muestra el más reciente cuando todas las lonas están avisadas.
  const antes = elegirCorreoStock(stock) ? null : stock.faltas.reduce<(typeof stock.faltas)[number]["yaAvisado"]>((ultimo, f) =>
    f.yaAvisado && (!ultimo || f.yaAvisado.creadoAt > ultimo.creadoAt) ? f.yaAvisado : ultimo, null);
  return (
    <section className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
      <h4 className="font-bold">
        Falta material <span className="font-normal text-amber-800 dark:text-amber-300">· {stock.faltas.length === 1 ? "1 lona" : `${stock.faltas.length} lonas`}</span>
      </h4>
      <ul className="mt-2 space-y-2">{stock.faltas.map(f => {
        // Lo mismo que el correo (lib/correo-stock): necesita, disponible, reservas por pedido y bobinas.
        const r = resumenFalta(f);
        const nota = notaBobinas(r);
        return (
          <li key={JSON.stringify([f.entrega, f.codigo, f.ofs])}
            className="rounded-xl bg-white/70 px-3 py-2.5 dark:bg-black/25">
            <p className="font-bold">{r.nombre || r.codigo}</p>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              {[r.nombre ? r.codigo : "", f.entrega > 0 ? `Entrega ${f.entrega}` : "", textoOFStock(f.ofs)].filter(Boolean).join(" · ")}
            </p>
            <dl className="mt-1.5 grid grid-cols-[auto_auto] justify-start gap-x-6 tabular-nums">
              <dt>Necesita</dt><dd className="text-right font-bold">{metrosCuenta(r.necesita)}</dd>
              <dt>Stock disponible</dt>
              <dd className={`text-right font-bold ${nota ? "" : "text-[#c20e4d] dark:text-rose-300"}`}>{metrosCuenta(r.disponible)}</dd>
              {r.reservas.map(x => (
                <Fila key={x.pedido} etiqueta={`Reservado · ${x.pedido}`} valor={metrosCuenta(x.ml)} />
              ))}
              {r.reservadoSinDesglose > 0 && <Fila etiqueta="Reservado para otros pedidos" valor={metrosCuenta(r.reservadoSinDesglose)} />}
              {r.reservadoPropio > 0 && <Fila etiqueta="Ya reservado para este pedido" valor={metrosCuenta(r.reservadoPropio)} />}
            </dl>
            {nota && <p className="mt-1.5 font-bold text-[#c20e4d] dark:text-rose-300">{nota}</p>}
          </li>
        );
      })}</ul>
      <label className="mt-2 flex min-h-11 items-center gap-3 text-base font-bold">
        <input className="size-6 shrink-0 accent-brand-500" type="checkbox" checked={marcado}
          disabled={modo === "off"} onChange={e => onCambiar(e.target.checked)} />
        Mandar correo a Compras y Almacén
      </label>
      {modo === "off" && <p>El envío de correos está apagado.</p>}
      {modo === "ensayo" && <p>En modo ensayo solo se enviará al destinatario de prueba.</p>}
      {antes && <p>Ya se avisó el {cuando(antes.creadoAt)}{antes.pasadoPor && ` (${antes.pasadoPor})`}</p>}
    </section>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <>
      <dt className="text-xs text-amber-800 dark:text-amber-300">{etiqueta}</dt>
      <dd className="text-right text-xs text-amber-800 dark:text-amber-300">{valor}</dd>
    </>
  );
}
