import type { PedidoEntregaBelen } from "../entregas-belen";
import { PEDIDOS } from "../mock";
import { SECCION_POR_DEFECTO } from "../secciones";
import { estaFinalizado } from "../types";
import { asegurarIndice, indiceSiListo } from "./historial-indice";

/** Series que salen en la lista: Arzúa y las delegaciones (Santiago y
 *  Bergondo). La pantalla elige cuál ver; por defecto, AR. */
const SERIES = ["AR.", "SA.", "BE."];

/** Misma fecha y mismo criterio de entrega pendiente que Coordina para todos. */
export async function leerEntregasBelen(): Promise<PedidoEntregaBelen[]> {
  if (process.env.DATASOURCE !== "rps") {
    return PEDIDOS.filter((p) => SERIES.some((s) => p.codigo.startsWith(s))).map((p) => ({
      codigo: p.codigo, cliente: p.cliente ?? null, ciudad: p.ciudadEntrega ?? null,
      fechaEntrega: p.fechaEntrega || null, situacion: estaFinalizado(p) ? "salir" : "fabrica", ofs: p.ofs.length,
    }));
  }
  await asegurarIndice();
  const indice = indiceSiListo();
  if (!indice) throw new Error("La lista de pedidos se está preparando");
  return indice.base[SECCION_POR_DEFECTO]
    .filter((b) => b.pendienteEntrega && SERIES.some((s) => b.pedido.startsWith(s)))
    .map((b) => {
      const info = indice.info.get(b.pedido);
      return {
        codigo: b.pedido, cliente: info?.cliente ?? null, ciudad: info?.ciudadEntrega ?? null,
        fechaEntrega: b.fechaEntrega === null ? null : new Date(b.fechaEntrega).toISOString().slice(0, 10),
        situacion: b.trabajoAbierto ? "fabrica" : "salir", ofs: b.nOf,
      };
    });
}
