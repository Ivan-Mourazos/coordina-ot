import { readFile } from "node:fs/promises";
import { rutaPdfPedido } from "@/lib/server/pdf-pedido";

// ─── GET /api/publico/pedidos/AR.26.02711/pdf ────────────────────────────────
// La gemela pública de `/api/pedidos/[archivo].pdf` (que pasa a pedir sesión
// en la Task 5): sirve el PDF escaneado del pedido para quien lo abre sin
// login. El PDF SÍ está aprobado para el invitado —junto con los datos de
// cliente—, y sin esta ruta el `scanUrl` que reescribe `detallePublico`
// (lib/publico.ts) apuntaría a un enlace que da 401.
//
// Copiada de la rama .pdf de esa ruta sin más cambio que el de la miniatura
// PNG, que aquí no hace falta: nada público la pide todavía (es para la
// tarjeta del tablero interno). La resolución del fichero
// (`rutaPdfPedido`, compartida con el vigilante de re-escaneos) y la
// comprobación del código de pedido son las mismas y tienen que seguir
// siéndolo.

/** Solo códigos de pedido de venta reales: nada de path traversal ni
 *  comodines. Tres prefijos, uno por delegación — igual que en
 *  `/api/pedidos/[archivo]`, del que esta ruta es gemela. */
const CODIGO_RE = /^(AR|SA|BE)\.\d{2}\.\d{5}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pedido: string }> },
) {
  const { pedido } = await params;
  if (!CODIGO_RE.test(pedido)) {
    return new Response("Código de pedido no válido", { status: 400 });
  }

  const codigo = pedido.toUpperCase();
  // La ruta la arma `rutaPdfPedido` (lib/server/pdf-pedido.ts): aquí no puede
  // ser null, CODIGO_RE ya garantiza que el código es de un pedido de venta.
  const rutaPdf = rutaPdfPedido(codigo)!;

  try {
    const pdf = await readFile(rutaPdf);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${codigo}.pdf"`,
        // El escaneo de un pedido no cambia: cache larga en el navegador.
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new Response("PDF no encontrado", { status: 404 });
  }
}
