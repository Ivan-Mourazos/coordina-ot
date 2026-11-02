import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { archivoDeRuta, comoServir, esImagen, segmentosEnShare } from "@/lib/historial";
import { comoDocumentoRps } from "@/lib/solicitudes";
import { miniaturaCacheada, redimensionarImagen, renderizarPdf } from "@/lib/server/miniaturas";
import { rutaAdjunto } from "@/lib/server/solicitudes-db";
import { soloConSesion } from "@/lib/server/sesion";

// ─── GET /api/solicitudes/adjunto/{tarea}/{1|2} ──────────────────────────────
// El fichero que el comercial adjuntó. Mismas defensas que los documentos del
// pedido (/api/historial/[pedido]/documento): el navegador pide por tarea y
// número, la ruta sale de la BD y solo se sirve lo que cuelga del share de RPS.

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RAIZ =
  process.platform === "win32"
    ? (process.env.RPS_DOCS_DIR_WIN ?? "\\\\192.168.0.128\\RPS")
    : (process.env.RPS_DOCS_DIR ?? "/mnt/rps");

/** Las miniaturas, aparte de las de los documentos del pedido. */
const CACHE_MINIATURAS = path.join(process.cwd(), ".next", "cache", "solicitudes-thumbs");

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tarea: string; numero: string }> },
) {
  const corte = soloConSesion(req);
  if (corte) return corte;

  const { tarea, numero } = await params;
  if (!GUID_RE.test(tarea) || (numero !== "1" && numero !== "2")) {
    return new Response("Adjunto no válido", { status: 400 });
  }

  let guardada: string | null;
  try {
    guardada = await rutaAdjunto(tarea, numero === "1" ? 1 : 2);
  } catch (e) {
    console.error("[solicitudes] adjunto: RPS falló:", (e as Error).message);
    return new Response("No se pudo consultar el adjunto", { status: 500 });
  }
  if (!guardada) return new Response("Adjunto no encontrado", { status: 404 });

  const segmentos = segmentosEnShare(comoDocumentoRps(guardada));
  if (!segmentos) return new Response("Ese adjunto no está en el archivo de RPS", { status: 404 });
  const ruta = path.join(RAIZ, ...segmentos);
  if (!path.resolve(ruta).startsWith(path.resolve(RAIZ))) {
    console.error("[solicitudes] adjunto fuera de la raíz del share:", guardada);
    return new Response("Adjunto no encontrado", { status: 404 });
  }

  const archivo = archivoDeRuta(guardada);
  const { tipo, incrustable } = comoServir(archivo);

  // ?mini=1 → la imagen que el visor enseña mientras carga el PDF.
  if (new URL(req.url).searchParams.get("mini") === "1") {
    return await miniatura(ruta, guardada, archivo, tipo);
  }

  let contenido: Buffer;
  try {
    contenido = await readFile(ruta);
  } catch {
    return new Response("Adjunto no encontrado", { status: 404 });
  }

  const nombre = archivo.replace(/[^\w.\- ]/g, "_");
  return new Response(new Uint8Array(contenido), {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": `${incrustable ? "inline" : "attachment"}; filename="${nombre}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    },
  });
}

async function miniatura(ruta: string, original: string, archivo: string, tipo: string): Promise<Response> {
  const esPdf = tipo === "application/pdf";
  if (!esPdf && !esImagen(archivo)) return new Response("Ese adjunto no tiene miniatura", { status: 415 });
  try {
    const { mtimeMs } = await stat(ruta);
    const clave = createHash("sha1").update(original).digest("hex");
    const bytes = await miniaturaCacheada(CACHE_MINIATURAS, `${clave}.${esPdf ? "png" : "jpg"}`, mtimeMs, () =>
      esPdf ? renderizarPdf(ruta) : redimensionarImagen(ruta),
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": esPdf ? "image/png" : "image/jpeg",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (e) {
    console.error("[solicitudes] miniatura fallida:", archivo, (e as Error).message);
    return new Response("No se pudo generar la miniatura", { status: 415 });
  }
}
