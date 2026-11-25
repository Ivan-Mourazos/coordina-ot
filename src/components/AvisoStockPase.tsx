import type { VistaPlanteamiento } from "@/lib/planteamiento-textos";
import { cuando } from "@/lib/planteamiento-textos";
import { faltanStock, metrosCuenta, metrosStock, textoOFStock, tieneCuentaStock } from "@/lib/correo-stock";

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
      <h4 className="font-bold">Falta material</h4>
      <ul>{stock.faltas.map(f => {
        const prefijo = `${f.codigo}${f.entrega > 0 ? ` · Entrega ${f.entrega}` : ""} · ${textoOFStock(f.ofs)}`;
        return (
          <li key={JSON.stringify([f.entrega, f.codigo, f.ofs])}>
            {tieneCuentaStock(f) ? (
              <>
                {`${prefijo} · stock ${metrosCuenta(f.stock)} − ${metrosCuenta(f.reservado)} reservados = ${metrosCuenta(f.disponible)} disponible · necesita ${metrosCuenta(f.necesita)} · `}
                <strong className="text-[#c20e4d] dark:text-rose-300">{`faltan ${metrosCuenta(faltanStock(f))}`}</strong>
                {f.reservadoPropio > 0 && (
                  <span className="block text-xs text-amber-800 dark:text-amber-300">
                    {`Reservado para este pedido: ${metrosCuenta(f.reservadoPropio)} (no se resta)`}
                  </span>
                )}
              </>
            ) : (
              `${prefijo} · necesita ${metrosStock(f.necesita)} · disponible ${metrosStock(f.disponible)}`
            )}
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
