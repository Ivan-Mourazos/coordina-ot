import { leerComprobacionesLona } from "@/lib/server/stock-lona-db";
import { ofsConLona } from "@/lib/server/rps";
import { leerPersona } from "@/lib/server/personas-db";
import { NextResponse } from "next/server";
import { esCodigoPedido } from "@/lib/types";
import { partesDe, vaAdjunto } from "@/lib/planteamiento";
import { planteamientosDe } from "@/lib/server/planteamiento-pdf";
import { pedidoEsDePvc } from "@/lib/server/pvc-db";
import { leerImpresionesDe, modoImpresion, puedeImprimirEnOt } from "@/lib/server/impresion-cola";
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

function stockDelPedido(pedido: string, ofs: string[]) {
  try {
    const { resultado, sinComprobar } = leerComprobacionesLona(pedido, ofs);
    const faltas = resultado.flatMap(s => s.faltas.map(f => {
      const aviso = f.yaAvisado;
      return { ...f, entrega: s.entrega, yaAvisado: aviso && {
        creadoAt: aviso.creadoAt,
        pasadoPor: leerPersona(aviso.pasadoPor)?.nombre ?? aviso.pasadoPor,
      } };
    }));
    return { stockLona: faltas.length ? { faltas } : null, sinComprobar };
  } catch (e) {
    console.error(`[stock] no se pudo leer el aviso de ${pedido}`, e);
    return { stockLona: null, sinComprobar: [] };
  }
}

async function lonasSinComprobar(ofs: string[]) {
  if (!ofs.length) return [];
  let reloj: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      ofsConLona(ofs),
      // La vista previa del cierre individual también espera esta respuesta.
      new Promise<string[]>(resolve => { reloj = setTimeout(() => resolve([]), 2_000); }),
    ]);
  } catch (e) {
    console.warn("[stock] no se pudieron consultar las OF con lona en RPS:", (e as Error).message);
    return [];
  } finally {
    clearTimeout(reloj);
  }
}

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;
  const { searchParams } = new URL(req.url);
  const pedido = searchParams.get("pedido") ?? "";
  if (!esCodigoPedido(pedido)) return NextResponse.json({ error: "Pedido no válido" }, { status: 400 });
  const { stockLona, sinComprobar } = stockDelPedido(pedido, searchParams.getAll("of"));
  const [{ ficheros, aviso }, pvc, ofsLonaSinComprobar] = await Promise.all([
    planteamientosDe(pedido), pedidoEsDePvc(pedido), lonasSinComprobar(sinComprobar),
  ]);
  return NextResponse.json(
    {
      modo: modoImpresion(),
      // `adjunto`: si va en el correo (pedido de PVC, o -10 en adelante) o solo se imprime.
      // `partes`: cómo se reparte por tamaño de página y a qué impresora va
      // cada parte (ver `partesDe`).
      ficheros: ficheros.map(({ nombre, paginas, todoA4, tamanos }) => ({
        nombre, paginas, todoA4, adjunto: vaAdjunto(nombre, pedido, pvc), partes: tamanos?.length ? partesDe(tamanos) : undefined,
        // El tamaño de cada página, para «Elegir páginas…» del aviso de pasar.
        tamanos: tamanos?.length ? tamanos : undefined,
      })),
      // Sin código de departamento la de OT no imprime nada que le llegue
      // solo: entonces los A5 y A3 se imprimen a mano, como antes.
      puedeOt: puedeImprimirEnOt(),
      aviso,
      impresiones: leerImpresionesDe(pedido),
      stockLona,
      ofsLonaSinComprobar,
      correo: await correoDe(pedido),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
