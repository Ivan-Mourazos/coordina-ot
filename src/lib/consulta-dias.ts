import type { PedidoConsulta } from "./consulta";
import { tituloDia } from "./historial-dias";

// ─── La lista del invitado, por días ─────────────────────────────────────────
// Igual que el Historial del equipo: una tarjeta por día con la fecha encima.
// El día es el de la entrega solicitada, o el de salida si ya salió
// (`PedidoConsulta.dia`). La lista ya llega ordenada: un día nuevo empieza
// cuando cambia la fecha.

export interface DiaConsulta {
  /** yyyy-mm-dd o "sin-fecha". */
  clave: string;
  titulo: string;
  pedidos: PedidoConsulta[];
  /** Pedidos del día en la consulta ENTERA (lo manda el servidor), no solo los
   *  cargados: si no, el número crece según se pulsa «Ver más». */
  total: number;
}

export function agruparPedidosPorDia(
  pedidos: readonly PedidoConsulta[],
  opciones: { hoy: Date; totales: Record<string, number> },
): DiaConsulta[] {
  const dias: DiaConsulta[] = [];
  for (const pedido of pedidos) {
    const clave = pedido.dia ?? "sin-fecha";
    let dia = dias.at(-1);
    if (!dia || dia.clave !== clave) {
      let titulo = "Sin fecha";
      if (pedido.dia) {
        // A medianoche LOCAL: `tituloDia` compara con «hoy» del navegador para
        // decir «Hoy» y «Ayer», y con `new Date(iso)` (que es UTC) el día se
        // corría uno hacia atrás en España.
        const [y, m, d] = pedido.dia.split("-").map(Number);
        titulo = tituloDia(new Date(y, m - 1, d), opciones.hoy);
      }
      dia = { clave, titulo, pedidos: [], total: 0 };
      dias.push(dia);
    }
    dia.pedidos.push(pedido);
  }
  for (const dia of dias) dia.total = opciones.totales[dia.clave] ?? dia.pedidos.length;
  return dias;
}
