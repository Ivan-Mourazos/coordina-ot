import { NextResponse } from "next/server";
import { normalizarFiltrosVisitasCot } from "@/lib/visitas-cot";
import { leerVisitasCot } from "@/lib/server/visitas-cot-db";

// ─── GET /api/publico/visitas ────────────────────────────────────────────────
// Las consultas con OT para quien no tiene sesión. Son las mismas que ve el
// equipo: aquí no hay nada escrito entre nosotros, es lo que RPS guarda de
// cada aviso. La de siempre (/api/visitas-cot) pasa a pedir sesión en la
// Task 5, y esta queda como su puerta abierta.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const filtros = normalizarFiltrosVisitasCot(new URL(req.url).searchParams);
  try {
    const pagina = await leerVisitasCot(filtros);
    return NextResponse.json(pagina, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[publico] visitas falló:", (error as Error).message);
    return NextResponse.json({ error: "No se pudieron cargar las visitas" }, { status: 500 });
  }
}
