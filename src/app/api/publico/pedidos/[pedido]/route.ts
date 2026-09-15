import { NextResponse } from "next/server";
import { CODIGO_PEDIDO_RE } from "@/lib/historial";
import { leerDetallePublico } from "@/lib/server/publico-db";

// ─── GET /api/publico/pedidos/[pedido] ───────────────────────────────────────
// El pedido abierto, para quien no tiene sesión: sus OF con sus tareas y los
// documentos que RPS tiene colgados.
//
// Lo interno se quita AQUÍ y no en la pantalla: esconderlo en el navegador es
// decoración, porque la respuesta se lee escribiendo la dirección. El recorte
// en sí —qué campos salen del pedido y de cada OF, la URL pública de cada
// documento, y si cada tarea está cerrada— vive en `leerDetallePublico`
// (server/publico-db.ts, que junta `leerHistorialPedidoDetalle` con el cierre
// de cada tarea) y en `detallePublico` (lib/publico.ts, la lista blanca).
//
// SIN nombres, nunca, ni por OF ni por tarea: decisión de Iván, quién hizo el
// trabajo es cosa de casa. El TIEMPO de cada tarea sí depende de si el pedido
// sigue vivo o ya terminó — MISMA ruta para las dos listas, decidido con la
// propia tarea (`pedidoTerminado`, lib/publico.ts) y no con un parámetro de
// la petición: pendiente, se enseña qué falta y no el tiempo; terminado, el
// tiempo de cada paso y no hace falta marcar qué falta, porque no falta nada.

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
    const detalle = await leerDetallePublico(pedido);
    return NextResponse.json(detalle, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[publico] detalle falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo cargar el pedido" }, { status: 500 });
  }
}
