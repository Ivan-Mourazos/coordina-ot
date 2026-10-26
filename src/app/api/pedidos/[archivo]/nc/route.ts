import { NextResponse } from "next/server";
import { CODIGO_PEDIDO_RE } from "@/lib/historial";
import { ncDePedido } from "@/lib/server/nc-db";
import { soloConSesion } from "@/lib/server/sesion";

// ─── GET /api/pedidos/AR.26.02293/nc ─────────────────────────────────────────
// Las no conformidades del pedido: las que se abrieron por él (con el pedido
// que lo rectifica) y las que él mismo rectifica. Una consulta pequeña al
// abrir la ficha, aparte del tablero por lo mismo que los documentos (ver la
// ruta hermana `documentos`).

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ archivo: string }> },
) {
  const corte = soloConSesion(req);
  if (corte) return corte;

  // `archivo` por la ruta hermana del PDF; aquí es un código de pedido.
  const { archivo: pedido } = await params;
  if (!CODIGO_PEDIDO_RE.test(pedido)) {
    return NextResponse.json({ error: "Código de pedido no válido" }, { status: 400 });
  }

  try {
    return NextResponse.json({ nc: await ncDePedido(pedido) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[pedidos] nc: RPS falló:", (e as Error).message);
    // Un extra de la ficha: si falla, la ficha sigue (el bloque no sale).
    return NextResponse.json({ error: "No se pudieron cargar las no conformidades" }, { status: 500 });
  }
}
