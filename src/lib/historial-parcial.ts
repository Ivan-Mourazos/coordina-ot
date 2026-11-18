import { partirOfId } from "./bonos";
import type { Pedido } from "./types";

interface Pase {
  at: string;
  operarioId: string | null;
  ofIds?: readonly string[];
}

export interface HistorialParcial {
  ordenes: ReadonlySet<string>;
  at: string;
  operarioId: string | null;
}

/** El tablero decide qué pedidos siguen vivos. Solo los pases identificados
 *  por OF permiten que parte de ese trabajo entre también en el Historial. */
export function seleccionarHistorial(
  pedidos: readonly Pedido[],
  pases: ReadonlyMap<string, Pase>,
): { pendientes: string[]; parciales: Map<string, HistorialParcial> } {
  const pendientes: string[] = [];
  const parciales = new Map<string, HistorialParcial>();
  for (const pedido of pedidos) {
    const propias = pedido.ofs.filter((of) => !of.ajenaOT);
    if (propias.length === 0) continue;
    const detenidas = new Set(propias.filter((of) => of.detenida && of.estado !== "anulada").map((of) => of.codigo));
    if (pedido.situacion === "completado" && detenidas.size === 0) continue;
    pendientes.push(pedido.codigo);

    const ordenes = new Set<string>();
    let ultimo: Pick<Pase, "at" | "operarioId"> | undefined;
    const incluir = (orden: string, pase: Pick<Pase, "at" | "operarioId">) => {
      if (detenidas.has(orden) || !Number.isFinite(Date.parse(pase.at))) return;
      ordenes.add(orden);
      if (!ultimo || pase.at > ultimo.at) ultimo = pase;
    };
    const pase = pases.get(pedido.id) ?? pases.get(pedido.codigo);
    const actuales = new Map(pedido.ofs.map((of) => [of.id, of]));
    const reabiertas = new Set(pedido.reabiertoPor);
    for (const id of pase?.ofIds ?? []) {
      const actual = actuales.get(id);
      if (reabiertas.has(id) || (actual && (actual.estado !== "aprobada" || actual.ajenaOT))) continue;
      const orden = actual?.codigo ?? partirOfId(id)?.of;
      if (orden && pase) incluir(orden, pase);
    }
    for (const of of propias) {
      if (!of.cerradaRps || of.estado !== "aprobada") continue;
      incluir(of.codigo, { at: of.cerradaRps.at, operarioId: of.cerradaRps.por });
    }
    if (ultimo) parciales.set(pedido.codigo, { ordenes, at: ultimo.at, operarioId: ultimo.operarioId });
  }
  return { pendientes, parciales };
}
