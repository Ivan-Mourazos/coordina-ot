import { NextResponse } from "next/server";
import { buscarPedidosRps } from "@/lib/server/buscar-db";
import { esRangoFecha } from "@/lib/codigo-busqueda";
import { buscarOFStock, leerDescontadoBelen, leerFichandoAhora, leerHojaAlmacen, leerMaterialBelen, leerPedidoBelen, leerTiemposBelen } from "@/lib/server/vista-belen-db";
import { leerListaBelen } from "@/lib/server/vista-belen-listas-db";
import { soloConSesion } from "@/lib/server/sesion";
import { esIdLista } from "@/lib/vista-belen-listas";
import { leerEntregasBelen } from "@/lib/server/entregas-belen-db";

// ─── GET /api/vista-belen ─────────────────────────────────────────────────────
// La pantalla de Belén Alamancos (Producción), hecha a su medida. Solo lectura.
// El buscador encuentra cualquier serie (AR, SA, BE…); las pestañas, solo AR.
//
//   ?q=texto        pedidos que encajan con lo escrito (el buscador de siempre)
//   &fecha=mes|trimestre|anio|antiguos   acotado por la fecha del pedido
//   ?pedido=AR.…    el pedido con una fila por OF
//   ?tiempos=AR.…   todas sus tareas y cada fichaje de cada persona
//   ?material=AR.… lo asignado, reservado y comprado de cada OF
//   ?descontado=AR.… el material que salió de verdad (imputación de material)
//   ?ahora=AR.…     quién ficha AHORA en sus tareas (OLANET)
//   ?almacen=AR.…   su hoja de almacén sola (la ficha del pedido en OT)
//   ?lista=…        una de las pestañas (lib/vista-belen-listas.ts, LISTAS_BELEN);
//                   con &forzar=1 se recalcula aunque lo guardado sea reciente
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
    if (params.get("entregas") === "1") {
      return NextResponse.json({ pedidos: await leerEntregasBelen() }, { headers: SIN_CACHE });
    }
    const pedido = params.get("pedido");
    if (pedido !== null) {
      return NextResponse.json({ pedido: await leerPedidoBelen(pedido) }, { headers: SIN_CACHE });
    }

    const tiempos = params.get("tiempos");
    if (tiempos !== null) {
      return NextResponse.json({ tiempos: await leerTiemposBelen(tiempos) }, { headers: SIN_CACHE });
    }

    const ahora = params.get("ahora");
    if (ahora !== null) {
      return NextResponse.json({ fichando: await leerFichandoAhora(ahora) }, { headers: SIN_CACHE });
    }

    const material = params.get("material");
    if (material !== null) {
      return NextResponse.json({ material: await leerMaterialBelen(material) }, { headers: SIN_CACHE });
    }

    const descontado = params.get("descontado");
    if (descontado !== null) {
      return NextResponse.json({ descontado: await leerDescontadoBelen(descontado) }, { headers: SIN_CACHE });
    }

    const almacen = params.get("almacen");
    if (almacen !== null) {
      return NextResponse.json({ almacen: await leerHojaAlmacen(almacen) }, { headers: SIN_CACHE });
    }

    const lista = params.get("lista");
    if (lista !== null) {
      if (!esIdLista(lista)) return NextResponse.json({ error: "Lista desconocida" }, { status: 400 });
      const { filas, calculadaAt } = await leerListaBelen(lista, { forzar: params.get("forzar") === "1" });
      return NextResponse.json({ filas, calculadaAt }, { headers: SIN_CACHE });
    }

    const q = params.get("q") ?? "";
    // Un número de OF sin pedido es una OF de STOCK: se abre ella misma.
    const fecha = params.get("fecha");
    const rango = esRangoFecha(fecha) ? fecha : "todo";
    let pedidos = await buscarPedidosRps(q, rango);
    // Una OF de stock no se acota por fecha: es un código exacto.
    if (!pedidos.length && rango === "todo") pedidos = await buscarOFStock(q);
    return NextResponse.json({ pedidos }, { headers: SIN_CACHE });
  } catch (e) {
    console.error("[vista-belen] falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo leer RPS. Prueba otra vez en un momento." }, { status: 502 });
  }
}
