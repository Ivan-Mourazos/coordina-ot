import { NextResponse } from "next/server";
import { esCodigoPedido } from "@/lib/types";
import { modoCorreo, reenviarUltimo } from "@/lib/server/correo-cola";
import { identidad } from "@/lib/server/sesion";

// ─── POST /api/planteamiento/reenviar ────────────────────────────────────────
// «Reenviar» desde la ficha del Historial: vuelve a mandar el último correo del
// planteamiento de ese pedido, con el mismo asunto y cuerpo, a quien toque
// ahora según el modo. Solo con rol técnico.

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON no válido" }, { status: 400 });
  }
  const yo = identidad(req, b.operarioId, "tecnico");
  if (yo instanceof NextResponse) return yo;
  const pedido = typeof b.pedido === "string" ? b.pedido : "";
  if (!esCodigoPedido(pedido)) return NextResponse.json({ error: "Pedido no válido" }, { status: 400 });
  if (modoCorreo() === "off") return NextResponse.json({ error: "El correo está apagado" }, { status: 409 });
  try {
    if (!(await reenviarUltimo(pedido, yo.id))) {
      return NextResponse.json({ error: "No hay correo que reenviar" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[correo] no se pudo reenviar ${pedido}:`, (e as Error).message);
    return NextResponse.json({ error: "No se pudo preparar el correo" }, { status: 500 });
  }
}
