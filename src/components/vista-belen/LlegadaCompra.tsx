import { compraRecibida, fechaCorta } from "@/lib/vista-belen";
import { ESTADO_OPERACION, FECHA } from "./estilos-belen";

// ─── Cuándo llega (o llegó) una línea pedida a compras ───────────────────────
// Belén, 17/11/2026: mientras no llega, la fecha PREVISTA; cuando llega, la del
// ALBARÁN del proveedor. Siempre con su rótulo delante, para que no haya que
// adivinar cuál de las dos es.

export function LlegadaCompra({
  pedida,
  recibida,
  llego,
  prevista,
  hoy,
}: {
  pedida: number;
  recibida: number;
  llego?: string | null;
  prevista?: string | null;
  /** yyyy-mm-dd; con él, una prevista ya pasada sale en rojo. */
  hoy?: string;
}) {
  const rotulo = "text-[11px] font-medium text-text-muted";
  if (compraRecibida({ pedida, recibida })) {
    return (
      <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
        <span className={rotulo}>Albarán</span>
        <b className={`font-bold tabular-nums ${ESTADO_OPERACION.finalizado.tinta}`}>{llego ? fechaCorta(llego) : "sin fecha"}</b>
      </span>
    );
  }
  const tarde = !!(prevista && hoy && prevista < hoy);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1 whitespace-nowrap">
      <span className={rotulo}>Prevista</span>
      {prevista ? (
        <b
          className={`font-bold tabular-nums ${tarde ? "text-red-700 dark:text-red-300" : FECHA.compras.tinta}`}
          title={tarde ? "Ya tenía que haber llegado" : undefined}
        >
          {fechaCorta(prevista)}
        </b>
      ) : (
        <span className="text-text-muted">sin fecha</span>
      )}
      {recibida > 0 && llego && <span className={rotulo}>(parte, albarán {fechaCorta(llego)})</span>}
    </span>
  );
}
