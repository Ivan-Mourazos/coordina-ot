import type { Tablero } from "../data";
import type { Prioridad } from "../types";

// ─── La prioridad de cada OF, para la web de planteamientos ───────────────────
// Planteamientos pinta la prioridad del pedido en el borde de sus filas, como
// los paneles de aquí (Iván, 11/11/2026). La prioridad es del PEDIDO y viene de
// RPS con el tablero; la ruta de integración responde en menos de 4 s, así que
// solo se mira el tablero que YA está en memoria: nunca se espera a RPS por
// esto. Si no está, la OF sale sin prioridad y Planteamientos deja el borde sin
// color.

/** De varios tableros (uno por sección), la prioridad de las OF pedidas. Si una
 *  OF aparece en dos secciones, manda la prioridad más alta. */
export function prioridadesDeOfs(tableros: readonly Tablero[], ofs: readonly string[]): Map<string, Prioridad> {
  const buscadas = new Set(ofs);
  const mapa = new Map<string, Prioridad>();
  for (const tablero of tableros) {
    for (const pedido of tablero.pedidos) {
      for (const of of pedido.ofs) {
        if (!buscadas.has(of.codigo)) continue;
        const actual = mapa.get(of.codigo);
        if (actual === undefined || pedido.prioridad > actual) mapa.set(of.codigo, pedido.prioridad);
      }
    }
  }
  return mapa;
}

/** Los tableros que ya están en memoria, sin consultar nada. Con datos de
 *  prueba (sin RPS), los de prueba. */
export async function tablerosEnMemoria(): Promise<Tablero[]> {
  if (process.env.DATASOURCE === "rps") {
    const { tablerosEnCache } = await import("./rps");
    return tablerosEnCache();
  }
  const { OPERARIOS, PEDIDOS } = await import("../mock");
  return [{ operarios: OPERARIOS, pedidos: PEDIDOS }];
}
