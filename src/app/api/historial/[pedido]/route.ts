import { NextResponse } from "next/server";
import { leerHistorialPedidoDetalle } from "@/lib/server/historial-db";
import { CODIGO_PEDIDO_RE, estadoActualHistorial } from "@/lib/historial";
import { getTablero } from "@/lib/data";
import { seccionDe } from "@/lib/secciones";

// ─── GET /api/historial/[pedido] ─────────────────────────────────────────────
// Detalle (lazy) del pedido: tiempos de sus OF separados por centro de trabajo.
// La selección de sección controla el desglose visible en la lista y la ficha.

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ pedido: string }> },
) {
  const { pedido } = await params;
  if (!CODIGO_PEDIDO_RE.test(pedido))
    return NextResponse.json({ error: "Código de pedido no válido" }, { status: 400 });

  try {
    const seccion = seccionDe(new URL(req.url).searchParams.get("seccion")).id;
    const [detalle, tablero] = await Promise.all([leerHistorialPedidoDetalle(pedido, seccion), getTablero(seccion)]);
    const estadoActual = estadoActualHistorial(tablero.pedidos.find((p) => p.codigo === pedido));
    return NextResponse.json({ ...detalle, ...(estadoActual ? { estadoActual } : {}) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[historial] detalle falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo cargar el pedido" }, { status: 500 });
  }
}
