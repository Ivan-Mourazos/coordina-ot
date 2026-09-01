import { NextResponse } from "next/server";
import { getTablero } from "@/lib/data";
import { seccionDeOperario } from "@/lib/server/operarios";

// ─── GET /api/tablero ────────────────────────────────────────────────────────
// Tablero completo (RPS/mock + overlay) para el polling de sincronización del
// Board. Barato: la consulta pesada vive tras la caché stale-while-revalidate.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // La sección se deduce de QUIÉN pregunta, no la manda el cliente: así el
  // navegador no tiene que saber que existen las secciones, y no hay forma de
  // pedir la lista de otra sección escribiéndola en la URL. Sin operario —o con
  // uno desconocido— sale la de siempre, Oficina Técnica.
  const operarioId = new URL(req.url).searchParams.get("operarioId");
  const tablero = await getTablero(operarioId ? seccionDeOperario(operarioId) : undefined);
  return NextResponse.json(tablero, {
    headers: { "Cache-Control": "no-store" },
  });
}
