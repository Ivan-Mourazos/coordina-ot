import type { Tablero } from "../data";

// ─── Adaptador RPS → contrato de la UI ───────────────────────────────────────
// Devuelve las MISMAS formas que el mock (Operario[], Pedido[]). Reglas:
//  · Solo pedidos "procesados" entran como trabajo de OT.
//  · Fichaje de tiempos vía API de RPS, siempre por OF (no simular terminal).
// Las queries se escribirán cuando tengamos el esquema real
// (pnpm db:introspect desde la red de la oficina → docs/rps-schema.json).

export async function getTableroRPS(): Promise<Tablero> {
  // Comprobación temprana de conexión: falla con mensaje claro si no hay red/credenciales.
  const { getPool } = await import("./db");
  await getPool();

  throw new Error(
    "Adaptador RPS pendiente: falta mapear el esquema (ejecuta `pnpm db:introspect` en la oficina y genera las queries).",
  );
}
