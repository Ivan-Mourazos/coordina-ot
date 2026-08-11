import { NextResponse } from "next/server";
import { buscarPedidosRps } from "@/lib/server/buscar-db";

// ─── GET /api/buscar?q= ──────────────────────────────────────────────────────
// Cualquier pedido de venta de RPS, sin filtrar por si es trabajo de OT ni por
// si está terminado. Es la tercera fuente del buscador de la cabecera: el
// tablero y el Historial cubren lo nuestro, y esto cubre TODO lo demás.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json(
      { pedidos: await buscarPedidosRps(q) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[buscar] falló:", (e as Error).message);
    // Sin 500: el buscador ya está enseñando lo del tablero y el Historial, y
    // que RPS falle no debe dejar la caja de búsqueda en rojo.
    return NextResponse.json({ pedidos: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
