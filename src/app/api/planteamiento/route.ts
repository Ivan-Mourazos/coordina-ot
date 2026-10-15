import { NextResponse } from "next/server";
import { esCodigoPedido } from "@/lib/types";
import { vaAdjunto } from "@/lib/planteamiento";
import { planteamientosDe } from "@/lib/server/planteamiento-pdf";
import { leerImpresionesDe, modoImpresion } from "@/lib/server/impresion-cola";
import { copiasCorreo, leerCorreosDe, modoCorreo } from "@/lib/server/correo-cola";
import { getTablero } from "@/lib/data";
import { soloConSesion } from "@/lib/server/sesion";
import { avisoCaducidadSecreto } from "@/lib/server/graph-correo";

// ─── GET /api/planteamiento?pedido=AR.26.05016 ───────────────────────────────
// Lo que el diálogo de pasar enseña («se imprimirá…») y lo que la ficha del
// Historial cuenta de lo ya impreso. Solo lectura. La ruta del disco NO sale
// de aquí: el navegador solo ve nombre, páginas y si todo es A4.

export const dynamic = "force-dynamic";

/** El estado del correo, aparte y sin poder tumbar la respuesta: si su tabla
 *  fallara, el diálogo y la ficha siguen contando lo de la impresión. */
async function correoDe(pedido: string) {
  try {
    const modo = modoCorreo();
    // La vista previa usa los mismos autores y la misma regla que el pase;
    // no promete copias para autores desconocidos ni para quien ya va en «para».
    let cc: string[] = [];
    if (modo === "activo") {
      try {
        const p = (await getTablero("ot")).pedidos.find((p) => p.codigo === pedido);
        cc = copiasCorreo(modo, p?.ofs.filter((of) => of.estado !== "anulada" && !of.ajenaOT).map((of) => of.autorId) ?? []);
      } catch (e) {
        // Un fallo de RPS no debe ocultar los correos que ya constan en SQLite.
        console.warn(`[correo] no se pudieron consultar los autores de ${pedido}:`, (e as Error).message);
      }
    }
    // Para avisar al pasar de que el permiso de mandar correos caduca pronto.
    return { modo, cc, envios: leerCorreosDe(pedido), caducaSecreto: modo === "off" ? null : avisoCaducidadSecreto() };
  } catch (e) {
    console.error(`[correo] no se pudo leer el estado de ${pedido}:`, (e as Error).message);
    return { modo: modoCorreo(), envios: [] };
  }
}

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;
  const pedido = new URL(req.url).searchParams.get("pedido") ?? "";
  if (!esCodigoPedido(pedido)) return NextResponse.json({ error: "Pedido no válido" }, { status: 400 });
  const { ficheros, aviso } = await planteamientosDe(pedido);
  return NextResponse.json(
    {
      modo: modoImpresion(),
      // `adjunto`: si va en el correo (PVC, -10 en adelante) o solo se imprime.
      ficheros: ficheros.map(({ nombre, paginas, todoA4 }) => ({ nombre, paginas, todoA4, adjunto: vaAdjunto(nombre, pedido) })),
      aviso,
      impresiones: leerImpresionesDe(pedido),
      correo: await correoDe(pedido),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
