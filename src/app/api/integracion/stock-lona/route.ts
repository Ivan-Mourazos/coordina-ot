import { claveValida } from "@/lib/integracion";
import { guardarStockLona, validarStockLona } from "@/lib/server/stock-lona-db";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const clave = process.env.INTEGRACION_CLAVE;
  if (!clave) return Response.json({ error: "Integración sin configurar" }, { status: 503, headers });
  if (!claveValida(req.headers.get("x-clave-integracion"), clave))
    return Response.json({ error: "Clave no válida" }, { status: 401, headers });
  const stock = validarStockLona(await req.json().catch(() => null));
  if (!stock) return Response.json({ error: "Stock de lona no válido" }, { status: 400, headers });
  guardarStockLona(stock);
  return Response.json({ ok: true }, { headers });
}
