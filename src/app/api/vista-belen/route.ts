import { NextResponse } from "next/server";
import { buscarPedidosRps } from "@/lib/server/buscar-db";
import { leerPedidoBelen, leerTiemposBelen } from "@/lib/server/vista-belen-db";
import { leerListaBelen } from "@/lib/server/vista-belen-listas-db";
import { soloConSesion } from "@/lib/server/sesion";
import { esIdLista } from "@/lib/vista-belen-listas";

// ─── GET /api/vista-belen ─────────────────────────────────────────────────────
// La pantalla de Belén Alamancos (Producción), hecha a su medida. Solo lectura.
// El buscador encuentra cualquier serie (AR, SA, BE…); las pestañas, solo AR.
//
//   ?q=texto        pedidos que encajan con lo escrito (el buscador de siempre)
//   ?pedido=AR.…    el pedido con una fila por OF
//   ?tiempos=AR.…   todas sus tareas y cada fichaje de cada persona
//   ?lista=…        una de las pestañas (lib/vista-belen-listas.ts, LISTAS_BELEN)
//
// Con el login encendido pide sesión, como el resto de lo que no es para toda
// la red. No escribe nada, así que no hace falta ningún rol.

export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;

  const params = new URL(req.url).searchParams;
  try {
    const pedido = params.get("pedido");
    if (pedido !== null) {
      return NextResponse.json({ pedido: await leerPedidoBelen(pedido) }, { headers: SIN_CACHE });
    }

    const tiempos = params.get("tiempos");
    if (tiempos !== null) {
      return NextResponse.json({ tiempos: await leerTiemposBelen(tiempos) }, { headers: SIN_CACHE });
    }

    const lista = params.get("lista");
    if (lista !== null) {
      if (!esIdLista(lista)) return NextResponse.json({ error: "Lista desconocida" }, { status: 400 });
      return NextResponse.json({ filas: await leerListaBelen(lista) }, { headers: SIN_CACHE });
    }

    const q = params.get("q") ?? "";
    const pedidos = await buscarPedidosRps(q);
    return NextResponse.json({ pedidos }, { headers: SIN_CACHE });
  } catch (e) {
    console.error("[vista-belen] falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo leer RPS. Prueba otra vez en un momento." }, { status: 502 });
  }
}
