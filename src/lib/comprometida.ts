import type { Pedido } from "./types";

// ─── Fecha comprometida con el cliente ───────────────────────────────────────
// No es un campo del pedido: Producción la apunta en el workflow de RPS, en el
// formulario «Opción pedido», que deja un campo `Pedido` y otro `Fecha
// comprometida` (BPMDataFormField). Es lo que su herramienta enseña como
// «F.Compro». Si se renegocia se rellena otro formulario, y por eso un pedido
// puede tener varias: en AR.26.01813 hay tres, todas distintas.

export interface FilaComprometida {
  pedido: string | null;
  /** ISO yyyy-mm-dd. null en los formularios que se abandonaron en blanco. */
  fecha: string | null;
  grabada: Date | string;
}

/** La fecha vigente de cada pedido: la del ÚLTIMO formulario, no la mayor. Lo
 *  comprometido también se puede adelantar. */
export function ultimaComprometida(filas: readonly FilaComprometida[]): Map<string, string> {
  const vigentes = new Map<string, { fecha: string; grabada: number }>();
  for (const f of filas) {
    const pedido = (f.pedido ?? "").trim();
    if (!pedido || !f.fecha) continue;
    const grabada = new Date(f.grabada).getTime();
    const actual = vigentes.get(pedido);
    if (!actual || grabada > actual.grabada) vigentes.set(pedido, { fecha: f.fecha, grabada });
  }
  return new Map([...vigentes].map(([pedido, v]) => [pedido, v.fecha]));
}

/** Ya pasó y el pedido sigue sin pasar a Producción. El mismo día no cuenta:
 *  todavía se puede llegar. */
export function comprometidaVencida(
  p: Pick<Pedido, "fechaComprometida" | "situacion">,
  hoy: string,
): boolean {
  return p.fechaComprometida !== undefined && p.fechaComprometida < hoy && p.situacion !== "completado";
}
