import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { miniaturaCacheada, renderizarPdf } from "@/lib/server/miniaturas";
import { rutaPdfPedido } from "@/lib/server/pdf-pedido";

// GET /api/pedidos/AR.26.02711.pdf — sirve el PDF escaneado del pedido desde
// el servidor de archivos (\\192.168.0.128\RPS\VENTAS\PEDIDOS\{año}\{delegación}\
// {codigo}.pdf, indexado también en GENEntityDocument). El servidor web
// necesita acceso de lectura al share. Si el fichero no existe se responde 404
// y la tarjeta enseña la réplica dibujada.
//
// GET /api/pedidos/AR.26.02711.png — miniatura PNG (~420 px de ancho) de la
// 1ª página del mismo PDF, renderizada en el servidor con pdfjs-dist +
// @napi-rs/canvas y cacheada en disco (.next/cache/pedidos-thumbs). Pensada
// como imagen de las tarjetas del tablero: tras el primer render, cada
// petición se sirve directamente del fichero cacheado. El motor de render y la
// caché viven en lib/server/miniaturas.ts, compartidos con los documentos del
// pedido.

/** Solo códigos de pedido reales: nada de path traversal ni comodines.
 *
 *  Tres prefijos, uno por delegación. El grupo 1 es el código entero. La
 *  carpeta donde vive cada uno la resuelve `rutaPdfPedido`. */
const ARCHIVO_RE = /^((AR|SA|BE)\.(\d{2})\.\d{5})\.(pdf|png)$/i;

/** Carpeta de caché de miniaturas, dentro de la caché de Next. */
const CACHE_DIR = path.join(process.cwd(), ".next", "cache", "pedidos-thumbs");

const CABECERAS_PNG = {
  "Content-Type": "image/png",
  // La miniatura de un escaneo no cambia: cache larga en el navegador.
  "Cache-Control": "private, max-age=86400",
} as const;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ archivo: string }> },
) {
  const { archivo } = await params;
  const m = ARCHIVO_RE.exec(archivo);
  if (!m) {
    return new Response("Código de pedido no válido", { status: 400 });
  }

  // "AR.26.02711.pdf" → año 2026 (el 3er segmento del código es el año).
  const codigo = m[1].toUpperCase();
  const extension = m[4].toLowerCase();
  // La ruta la arma `rutaPdfPedido` (lib/server/pdf-pedido.ts), compartida con
  // el vigilante de re-escaneos: dos copias se habrían separado a la primera
  // reorganización del share, y entonces el que avisa miraría un sitio distinto
  // del que sirve el fichero. Aquí no puede ser null: ARCHIVO_RE ya garantiza
  // que el código es de un pedido de venta.
  const rutaPdf = rutaPdfPedido(codigo)!;

  if (extension === "png") {
    let mtimePdf: number;
    try {
      mtimePdf = (await stat(rutaPdf)).mtimeMs;
    } catch {
      return new Response("PDF no encontrado", { status: 404 });
    }
    try {
      const png = await miniaturaCacheada(CACHE_DIR, `${codigo}.png`, mtimePdf, () =>
        renderizarPdf(rutaPdf),
      );
      return new Response(new Uint8Array(png), { headers: CABECERAS_PNG });
    } catch (error) {
      console.error(`Miniatura de ${codigo} fallida:`, error);
      return new Response("No se pudo generar la miniatura", { status: 500 });
    }
  }

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
