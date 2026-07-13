import { NextResponse } from "next/server";
import { getTablero } from "@/lib/data";

// ─── GET /api/tablero ────────────────────────────────────────────────────────
// Tablero completo (RPS/mock + overlay) para el polling de sincronización del
// Board. Barato: la consulta pesada vive tras la caché stale-while-revalidate.

export const dynamic = "force-dynamic";

export async function GET() {
  const tablero = await getTablero();
  return NextResponse.json(tablero, {
    headers: { "Cache-Control": "no-store" },
  });
}
