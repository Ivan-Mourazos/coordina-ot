import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { comoServir, esImagen } from "@/lib/historial";
import { miniaturaCacheada, redimensionarImagen, renderizarPdf } from "@/lib/server/miniaturas";
import { documentoTecnico, rutaLocal } from "@/lib/server/solicitudes-db";
import { soloConSesion } from "@/lib/server/sesion";

// ─── GET /api/solicitudes/documento/{instancia} ──────────────────────────────
// El documento que subió el técnico, de la vista TGM_WF_COORDINA. El navegador
// solo manda el identificador de la solicitud; la ruta sale de la vista y pasa
// las mismas defensas que los adjuntos del comercial. El tipo sale del nombre
// con la extensión ya puesta por su contenido (en RPS se guarda sin ella).

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_MINIATURAS = path.join(process.cwd(), ".next", "cache", "solicitudes-thumbs");

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ instancia: string }> }) {
  const corte = soloConSesion(req);
  if (corte) return corte;

  const { instancia } = await params;
  if (!GUID_RE.test(instancia)) return new Response("Solicitud no válida", { status: 400 });

  let doc;
  try {
    doc = await documentoTecnico(instancia);
  } catch (e) {
    console.error("[solicitudes] documento: RPS falló:", (e as Error).message);
    return new Response("No se pudo consultar el documento", { status: 500 });
  }
  if (!doc) return new Response("Documento no encontrado", { status: 404 });

  const ruta = rutaLocal(doc.guardada);
  if (!ruta) return new Response("Ese documento no está en el archivo de RPS", { status: 404 });

  const { tipo, incrustable } = comoServir(doc.archivo);

  if (new URL(req.url).searchParams.get("mini") === "1") {
    const esPdf = tipo === "application/pdf";
    if (!esPdf && !esImagen(doc.archivo)) return new Response("Sin miniatura", { status: 415 });
    try {
      const { mtimeMs } = await stat(ruta);
      const clave = createHash("sha1").update(doc.guardada).digest("hex");
      const bytes = await miniaturaCacheada(CACHE_MINIATURAS, `t-${clave}.${esPdf ? "png" : "jpg"}`, mtimeMs, () =>
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
      console.error("[solicitudes] miniatura del técnico fallida:", doc.archivo, (e as Error).message);
      return new Response("No se pudo generar la miniatura", { status: 415 });
    }
  }

  let contenido: Buffer;
  try {
    contenido = await readFile(ruta);
  } catch {
    return new Response("Documento no encontrado", { status: 404 });
  }
  const nombre = doc.archivo.replace(/[^\w.\- ]/g, "_");
  return new Response(new Uint8Array(contenido), {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": `${incrustable ? "inline" : "attachment"}; filename="${nombre}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    },
  });
}
