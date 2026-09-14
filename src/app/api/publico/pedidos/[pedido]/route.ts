import { NextResponse } from "next/server";
import { CODIGO_PEDIDO_RE } from "@/lib/historial";
import { detallePublico } from "@/lib/publico";
import { leerHistorialPedidoDetalle } from "@/lib/server/historial-db";

// ─── GET /api/publico/pedidos/[pedido] ───────────────────────────────────────
// El pedido abierto, para quien no tiene sesión: sus OF, tareas, tiempos,
// personas y los documentos que RPS tiene colgados.
//
// El brief de esta tarea llamaba aquí a `leerHistorialPedido`, pero esa
// función solo da las OF (`HistorialOF[]`); el detalle completo —cabecera,
// documentos, `scanUrl`…— es `leerHistorialPedidoDetalle` (historial-db.ts),
// la misma que usa `/api/historial/[pedido]` para el equipo con sesión.
//
// Lo interno se quita AQUÍ y no en la pantalla: esconderlo en el navegador es
// decoración, porque la respuesta se lee escribiendo la dirección. El recorte
// en sí —qué campos salen del pedido y de cada OF, y la URL pública de cada
// documento— vive en `detallePublico` (lib/publico.ts), con lista blanca.

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pedido: string }> },
) {
  const { pedido } = await params;
  if (!CODIGO_PEDIDO_RE.test(pedido)) {
    return NextResponse.json({ error: "Código de pedido no válido" }, { status: 400 });
  }
  try {
    const detalle = await leerHistorialPedidoDetalle(pedido);
    return NextResponse.json(detallePublico(detalle), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[publico] detalle falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo cargar el pedido" }, { status: 500 });
  }
}
