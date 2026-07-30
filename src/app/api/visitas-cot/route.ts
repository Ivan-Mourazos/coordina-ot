import { NextResponse } from "next/server";
import { normalizarFiltrosVisitasCot } from "@/lib/visitas-cot";
import { leerVisitasCot } from "@/lib/server/visitas-cot-db";

// ─── GET /api/visitas-cot ───────────────────────────────────────────────────
// Consulta paginada de solo lectura. Pendientes e historial viven fuera del
// payload del tablero para no cargar RPS cuando nadie abre esta vista.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const filtros = normalizarFiltrosVisitasCot(new URL(req.url).searchParams);
  try {
    const pagina = await leerVisitasCot(filtros);
    return NextResponse.json(pagina, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[visitas-cot] consulta falló:", (error as Error).message);
    return NextResponse.json(
      { error: "No se pudieron cargar las visitas COT" },
      { status: 500 },
    );
  }
}
