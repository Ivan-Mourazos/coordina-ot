import { NextResponse } from "next/server";
import { esCodigoPedido } from "@/lib/types";
import { modoImpresion, prepararImpresion, trabajoDeFila } from "@/lib/server/impresion-cola";
import { identidad } from "@/lib/server/sesion";

// ─── POST /api/planteamiento/reimprimir ──────────────────────────────────────
// «Reimprimir» desde la ficha del Historial: vuelve a buscar el planteamiento
// —puede haberse corregido— y lo encola como al pasar. Solo con rol técnico.
//
// Con `id` (el panel de las impresoras), repite solo ese envío: las mismas
// páginas, con el mismo giro, en la misma impresora.

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
    if (b.id !== undefined) {
      const guardado = Number.isInteger(b.id) ? trabajoDeFila(b.id as number) : null;
      if (!guardado || guardado.pedido !== pedido) return NextResponse.json({ error: "Ese envío no se puede repetir" }, { status: 404 });
      return NextResponse.json(
        await prepararImpresion(pedido, yo.id, undefined, undefined, undefined, undefined, { fichero: guardado.fichero, trabajo: guardado.trabajo }),
      );
    }
    return NextResponse.json(await prepararImpresion(pedido, yo.id, undefined, undefined, undefined, undefined, undefined));
  } catch (e) {
    // prepararImpresion no lanza por una copia que falla, pero sí por la BD.
    console.error(`[impresion] no se pudo reimprimir ${pedido}:`, (e as Error).message);
    return NextResponse.json({ error: "No se pudo preparar la impresión" }, { status: 500 });
  }
}
