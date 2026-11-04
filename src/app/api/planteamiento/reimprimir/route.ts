import { NextResponse } from "next/server";
import { esCodigoPedido } from "@/lib/types";
import { modoImpresion, prepararImpresion } from "@/lib/server/impresion-cola";
import type { Papel } from "@/lib/planteamiento";
import { identidad } from "@/lib/server/sesion";

// ─── POST /api/planteamiento/reimprimir ──────────────────────────────────────
// «Reimprimir» desde la ficha del Historial: vuelve a buscar el planteamiento
// —puede haberse corregido— y lo encola como al pasar. Solo con rol técnico.

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON no válido" }, { status: 400 });
  }
  const pedido = typeof b.pedido === "string" ? b.pedido : "";
  if (!esCodigoPedido(pedido)) return NextResponse.json({ error: "Pedido no válido" }, { status: 400 });
  const yo = identidad(req, b.operarioId, "tecnico");
  if (yo instanceof NextResponse) return yo;
  if (modoImpresion() === "off") return NextResponse.json({ error: "La impresión está apagada" }, { status: 409 });
  try {
    // Con fichero y papel, solo esa parte: «Reimprimir» el A5 sin repetir los A4.
    const papel: Papel | null | undefined = b.papel === "A4" || b.papel === "A5" || b.papel === "A3" ? b.papel : b.papel === null ? null : undefined;
    const soloParte = typeof b.fichero === "string" && b.fichero && papel !== undefined ? { fichero: b.fichero, papel } : undefined;
    return NextResponse.json(await prepararImpresion(pedido, yo.id, undefined, undefined, undefined, undefined, soloParte));
  } catch (e) {
    // prepararImpresion no lanza por una copia que falla, pero sí por la BD.
    console.error(`[impresion] no se pudo reimprimir ${pedido}:`, (e as Error).message);
    return NextResponse.json({ error: "No se pudo preparar la impresión" }, { status: 500 });
  }
}
