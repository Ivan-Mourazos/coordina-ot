import { readFile } from "node:fs/promises";

// GET /api/pedidos/AR.26.02711.pdf — sirve el PDF escaneado del pedido desde
// el servidor de archivos (\\192.168.0.128\RPS\VENTAS\PEDIDOS\{año}\{codigo}.pdf,
// indexado también en GENEntityDocument). El servidor web necesita acceso de
// lectura al share. Si el fichero no existe se responde 404 y la tarjeta
// enseña la réplica dibujada.

/** Solo códigos de pedido reales: nada de path traversal ni comodines. */
const ARCHIVO_RE = /^AR\.(\d{2})\.\d{5}\.pdf$/i;

const RAIZ =
  process.env.RPS_PEDIDOS_PDF_DIR ?? "\\\\192.168.0.128\\RPS\\VENTAS\\PEDIDOS";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ archivo: string }> },
) {
  const { archivo } = await params;
  const m = ARCHIVO_RE.exec(archivo);
  if (!m) {
    return new Response("Código de pedido no válido", { status: 400 });
  }

  // "AR.26.02711.pdf" → año 2026 (el 2º segmento del código es el año).
  const anho = 2000 + Number(m[1]);
  const codigo = archivo.slice(0, -".pdf".length).toUpperCase();

  try {
    const pdf = await readFile(`${RAIZ}\\${anho}\\${codigo}.pdf`);
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
