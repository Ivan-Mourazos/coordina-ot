import type { Operario, Pedido } from "./types";
import { OPERARIOS, PEDIDOS } from "./mock";

// ─── ÚNICO punto de acceso a datos ───────────────────────────────────────────
// Hoy devuelve el mock. Para conectar RPS / SQL Server, sustituir el cuerpo de
// estas funciones por una llamada a una ruta API (app/api/...) que consulte la
// BD con `mssql`/Prisma. La UI no se toca: consume estas mismas firmas.

export interface Tablero {
  operarios: Operario[];
  pedidos: Pedido[];
}

export function getTableroInicial(): Tablero {
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
