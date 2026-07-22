import { NextResponse } from "next/server";
import { leerHistorialPedido } from "@/lib/server/historial-db";
import { CODIGO_PEDIDO_RE } from "@/lib/historial";

// ─── GET /api/historial/[pedido] ─────────────────────────────────────────────
// Detalle (lazy) de un pedido finalizado: sus OFs de OT con tiempo imputado y
// quién lo hizo. Valida el código para no inyectar ni pedir basura.

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pedido: string }> },
) {
  const { pedido } = await params;
  if (!CODIGO_PEDIDO_RE.test(pedido))
    return NextResponse.json({ error: "Código de pedido no válido" }, { status: 400 });

  try {
    const ofs = await leerHistorialPedido(pedido);
    return NextResponse.json({ pedido, ofs }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[historial] detalle falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo cargar el pedido" }, { status: 500 });
  }
}
