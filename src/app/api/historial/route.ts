import { NextResponse } from "next/server";
import { leerHistorialPagina } from "@/lib/server/historial-db";
import { seccionDe } from "@/lib/secciones";
import { getTablero } from "@/lib/data";
import { estadoActualHistorial } from "@/lib/historial";

// ─── GET /api/historial ──────────────────────────────────────────────────────
// Página del historial permanente de pedidos finalizados por OT. El page size
// lo fija el server (no viene del cliente). Filtros opcionales: q, desde, hasta.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const pageRaw = Number(url.searchParams.get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw >= 0 ? pageRaw : 0;

  try {
    const seccion = seccionDe(url.searchParams.get("seccion")).id;
    const [data, tablero] = await Promise.all([leerHistorialPagina({
      page,
      seccion,
      q: url.searchParams.get("q") ?? undefined,
      desde: url.searchParams.get("desde") ?? undefined,
      hasta: url.searchParams.get("hasta") ?? undefined,
      familia: url.searchParams.get("familia") ?? undefined,
      cliente: url.searchParams.get("cliente") ?? undefined,
    }), getTablero(seccion)]);
    const vigentes = new Map(tablero.pedidos.map((pedido) => [pedido.codigo, pedido]));
    const busqueda = url.searchParams.get("q")?.trim();
    return NextResponse.json({
      ...data,
      pedidos: data.pedidos.map((pedido) => {
        const estadoActual = estadoActualHistorial(vigentes.get(pedido.pedido));
        return { ...pedido, ...(busqueda ? { busqueda } : {}), ...(estadoActual ? {
          estadoActual, pasadoAt: undefined, pasadoPor: undefined,
        } : {}) };
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[historial] página falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo cargar el historial" }, { status: 500 });
  }
}
