import { NextResponse } from "next/server";
import { CODIGO_PEDIDO_RE } from "@/lib/historial";
import { leerDetalleConsulta } from "@/lib/server/publico-db";

// ─── GET /api/publico/pedidos/[pedido] ───────────────────────────────────────
// El pedido abierto, para quien no tiene sesión: la ficha del equipo (por
// centro, quién trabajó y cuánto, y las OF con sus tareas), dónde está ahora y
// los documentos que RPS tiene colgados.
//
// Lo interno se quita AQUÍ y no en la pantalla: esconderlo en el navegador es
// decoración, porque la respuesta se lee escribiendo la dirección. La lista
// blanca —campo a campo, del pedido y de cada OF— es `detalleConsulta`
// (lib/publico.ts): ni notas del pedido, ni notas de producción, ni causas de
// rechazo, ni comentario de venta, ni prioridad, ni estado interno.

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
    const detalle = await leerDetalleConsulta(pedido);
    return NextResponse.json(detalle, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[publico] detalle falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo cargar el pedido" }, { status: 500 });
  }
}
