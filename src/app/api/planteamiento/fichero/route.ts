import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { esCodigoPedido } from "@/lib/types";
import { planteamientosDe } from "@/lib/server/planteamiento-pdf";
import { extraerPaginas } from "@/lib/server/parte-pdf";
import { miniaturaCacheada, renderizarPdf } from "@/lib/server/miniaturas";
import { soloConSesion } from "@/lib/server/sesion";

// ─── GET /api/planteamiento/fichero?pedido=…&nombre=… ───────────────────────
// El PDF del planteamiento, para imprimirlo a mano o verlo antes de pasar. El
// nombre NO es una ruta: se busca en la lista del pedido, así que no se puede
// pedir otro fichero del disco.
//
//   &paginas=2,4   solo esas páginas (una parte del reparto por tamaño)
//   &girar=1       giradas un cuarto de vuelta, como se imprimirán
//   &mini=1        la miniatura de la primera de esas páginas, en PNG

export const dynamic = "force-dynamic";

const CACHE_MINIATURAS = path.join(process.cwd(), ".next", "cache", "planteamiento-thumbs");

function leerPaginas(v: string | null): number[] | null {
  if (!v) return null;
  const n = v.split(",").map((x) => Number(x.trim()));
  return n.length > 0 && n.length <= 200 && n.every((x) => Number.isInteger(x) && x >= 1 && x <= 999) ? n : null;
}

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;
  const q = new URL(req.url).searchParams;
  const pedido = q.get("pedido") ?? "";
  const nombre = q.get("nombre") ?? "";
  if (!esCodigoPedido(pedido)) return NextResponse.json({ error: "Pedido no válido" }, { status: 400 });
  const paginas = leerPaginas(q.get("paginas"));
  if (q.get("paginas") && !paginas) return NextResponse.json({ error: "Páginas no válidas" }, { status: 400 });
  const girar = q.get("girar") === "1";
  const f = (await planteamientosDe(pedido)).ficheros.find((x) => x.nombre === nombre);
  if (!f) return NextResponse.json({ error: "No existe" }, { status: 404 });

  // La miniatura no se gira aquí: la gira la pantalla, que así cambia al
  // momento al pulsar Vertical u Horizontal sin pedir otra imagen.
  if (q.get("mini") === "1") {
    const pagina = paginas?.[0] ?? 1;
    try {
      const { mtimeMs } = await stat(f.ruta);
      const clave = createHash("sha1").update(`${f.ruta}#${pagina}`).digest("hex");
      const png = await miniaturaCacheada(CACHE_MINIATURAS, `${clave}.png`, mtimeMs, () => renderizarPdf(f.ruta, pagina));
      return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-cache" } });
    } catch (e) {
      console.warn(`[planteamiento] miniatura de ${f.nombre} p.${pagina}:`, (e as Error).message);
      return NextResponse.json({ error: "Sin miniatura" }, { status: 415 });
    }
  }

  let datos: Uint8Array;
  try {
    const original = new Uint8Array(await readFile(f.ruta));
    datos = paginas || girar ? await extraerPaginas(original, paginas ?? Array.from({ length: f.paginas }, (_, i) => i + 1), girar) : original;
  } catch {
    // Estaba en la lista y ya no se puede leer (carpeta caída, fichero movido).
    return NextResponse.json({ error: "No se puede leer el fichero" }, { status: 404 });
  }
  return new NextResponse(datos as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
