import type { Operario, Pedido } from "./types";
import { OPERARIOS, PEDIDOS } from "./mock";

// ─── ÚNICO punto de acceso a datos ───────────────────────────────────────────
// Selector por env: DATASOURCE=mock (por defecto) | rps (SQL Server, oficina).
// La UI consume estas firmas y no sabe de dónde vienen los datos.
// El import del adaptador RPS es dinámico para que `mssql` no entre en el
// grafo cuando se trabaja con mock.

export interface Tablero {
  operarios: Operario[];
  pedidos: Pedido[];
}

export async function getTablero(): Promise<Tablero> {
  if (process.env.DATASOURCE === "rps") {
    const { getTableroRPS } = await import("./server/rps");
    return getTableroRPS();
  }
  return { operarios: OPERARIOS, pedidos: PEDIDOS };
}

// Futuro (acordado con IT / RPS):
//  · Datos de pedido y líneas (OF) vienen de RPS (cliente, código, situación…).
//  · Solo entran a OT los pedidos "procesados" (escaneado + OF asignada + pasado).
//    Los "pendientes de procesar" se podrán consultar pero no son trabajo de OT.
//  · Fichaje de tiempos vía API de RPS (no simular el terminal). Siempre por OF.
//  · Sin login por ahora: la web muestra qué hay para revisar, marcado por revisor.
// export async function asignarOF(ofId: string, operarioId: string | null) { ... }
// export async function ficharOF(ofId, rol, accion) { await fetch('/api/rps/fichaje', ...) }
