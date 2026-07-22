import { NextResponse } from "next/server";
import { leerHistorialPagina } from "@/lib/server/historial-db";

// ─── GET /api/historial ──────────────────────────────────────────────────────
// Página del historial permanente de pedidos finalizados por OT. El page size
// lo fija el server (no viene del cliente). Filtros opcionales: q, desde, hasta.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const pageRaw = Number(url.searchParams.get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw >= 0 ? pageRaw : 0;

  try {
    const data = await leerHistorialPagina({
      page,
      q: url.searchParams.get("q") ?? undefined,
      desde: url.searchParams.get("desde") ?? undefined,
      hasta: url.searchParams.get("hasta") ?? undefined,
      familia: url.searchParams.get("familia") ?? undefined,
      cliente: url.searchParams.get("cliente") ?? undefined,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[historial] página falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo cargar el historial" }, { status: 500 });
  }
}
