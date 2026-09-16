import { NextResponse } from "next/server";
import { leerMaterialGastadoPedido } from "@/lib/server/historial-db";
import { CODIGO_PEDIDO_RE } from "@/lib/historial";
import { soloConSesion } from "@/lib/server/sesion";

// ─── GET /api/historial/[pedido]/gastado ─────────────────────────────────────
// Aparte del detalle (`/api/historial/[pedido]`) y no dentro de
// `leerHistorialPedidoDetalle`: la consulta sin login llama a esa misma
// función (`detalleConsulta`, server/publico-db.ts), y metido ahí el invitado
// pagaría la consulta y su seguridad dependería de que la lista blanca de
// `ofConsulta` (lib/publico.ts) no lo copiara nunca. En ruta propia, el
// invitado no tiene camino para leerlo — ver "Cómo" de la sección 1 de la
// spec del 15/09/2026.

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ pedido: string }> },
) {
  const corte = soloConSesion(req);
  if (corte) return corte;

  const { pedido } = await params;
  if (!CODIGO_PEDIDO_RE.test(pedido))
    return NextResponse.json({ error: "Código de pedido no válido" }, { status: 400 });

  try {
    const gastado = await leerMaterialGastadoPedido(pedido);
    return NextResponse.json({ gastado }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[historial] material gastado falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo consultar el material gastado" }, { status: 500 });
  }
}
