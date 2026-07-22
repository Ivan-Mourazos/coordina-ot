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
  const base: Tablero =
    process.env.DATASOURCE === "rps"
      ? await (await import("./server/rps")).getTableroRPS()
      : { operarios: OPERARIOS, pedidos: PEDIDOS };

  // Overlay de CoordinaOT (SQLite): asignaciones, estados del flujo y
  // completados. Import dinámico para que better-sqlite3 no entre en el
  // bundle cliente. Si la BD falla, el tablero sale sin overlay: se pierde
  // flujo pero se sigue viendo el trabajo.
  try {
    const { leerOverlay } = await import("./server/estado-db");
    const { aplicarOverlay } = await import("./server/overlay");
    const conFlujo = aplicarOverlay(base, leerOverlay());

    const { leerTodosIntervalos } = await import("./server/fichaje-db");
    const { aplicarTiemposFichaje } = await import("./server/tiempos");
    return aplicarTiemposFichaje(
      conFlujo,
      leerTodosIntervalos(),
      new Date().toISOString(),
    );
  } catch (e) {
    console.warn("[coordina] overlay no disponible:", (e as Error).message);
    return base;
  }
}

// Futuro (acordado con IT / RPS):
//  · Datos de pedido y líneas (OF) vienen de RPS (cliente, código, situación…).
//  · Solo entran a OT los pedidos "procesados" (escaneado + OF asignada + pasado).
//    Los "pendientes de procesar" se podrán consultar pero no son trabajo de OT.
//  · Fichaje de tiempos vía API de RPS (no simular el terminal). Siempre por OF.
//  · Sin login por ahora: la web muestra qué hay para revisar, marcado por revisor.
// export async function asignarOF(ofId: string, operarioId: string | null) { ... }
// export async function ficharOF(ofId, rol, accion) { await fetch('/api/rps/fichaje', ...) }
