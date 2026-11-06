import { NextResponse } from "next/server";
import { esCodigoPedido } from "@/lib/types";
import { soloConSesion } from "@/lib/server/sesion";
import { buscadorCad, configCad } from "@/lib/server/cad";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;
  const parametros = new URL(req.url).searchParams;
  const pedido = parametros.get("pedido") ?? "";
  const headers = { "Cache-Control": "no-store" };
  if (!esCodigoPedido(pedido)) return NextResponse.json({ error: "Pedido no válido" }, { status: 400, headers });
  if (!configCad().roots.length) return NextResponse.json({ configurado: false, ficheros: [] }, { headers });
  try {
    const cad = buscadorCad();
    if (parametros.has("id")) {
      const fichero = await cad.elegir(pedido, parametros.get("id")!);
      return fichero
        ? NextResponse.json({ fichero }, { headers })
        : NextResponse.json({ error: "El DWG ya no está disponible para este pedido" }, { status: 404, headers });
    }
    return NextResponse.json({ configurado: true, ficheros: await cad.listar(pedido) }, { headers });
  } catch (error) {
    console.error("[cad] No se pudieron consultar los DWG:", error);
    return NextResponse.json({ error: "No se pudo consultar la carpeta CAD. Reintenta o avisa a informática." }, { status: 503, headers });
  }
}
