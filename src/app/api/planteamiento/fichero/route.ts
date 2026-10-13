import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { esCodigoPedido } from "@/lib/types";
import { planteamientosDe } from "@/lib/server/planteamiento-pdf";
import { soloConSesion } from "@/lib/server/sesion";

// ─── GET /api/planteamiento/fichero?pedido=…&nombre=… ───────────────────────
// El PDF para imprimirlo a mano, cuando lleva páginas que no son A4. El
// nombre NO es una ruta: se busca en la lista del pedido, así que no se puede
// pedir otro fichero del disco.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;
  const q = new URL(req.url).searchParams;
  const pedido = q.get("pedido") ?? "";
  const nombre = q.get("nombre") ?? "";
  if (!esCodigoPedido(pedido)) return NextResponse.json({ error: "Pedido no válido" }, { status: 400 });
  const f = (await planteamientosDe(pedido)).ficheros.find((x) => x.nombre === nombre);
  if (!f) return NextResponse.json({ error: "No existe" }, { status: 404 });
  let datos: Buffer;
  try {
    datos = await readFile(f.ruta);
  } catch {
    // Estaba en la lista y ya no se puede leer (carpeta caída, fichero movido).
    return NextResponse.json({ error: "No se puede leer el fichero" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(datos), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(f.nombre)}"`,
      "Cache-Control": "no-store",
    },
  });
}
