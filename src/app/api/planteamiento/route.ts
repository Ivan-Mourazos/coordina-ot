import { NextResponse } from "next/server";
import { esCodigoPedido } from "@/lib/types";
import { planteamientosDe } from "@/lib/server/planteamiento-pdf";
import { leerImpresionesDe, modoImpresion } from "@/lib/server/impresion-cola";
import { soloConSesion } from "@/lib/server/sesion";

// ─── GET /api/planteamiento?pedido=AR.26.05016 ───────────────────────────────
// Lo que el diálogo de pasar enseña («se imprimirá…») y lo que la ficha del
// Historial cuenta de lo ya impreso. Solo lectura. La ruta del disco NO sale
// de aquí: el navegador solo ve nombre, páginas y si todo es A4.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;
  const pedido = new URL(req.url).searchParams.get("pedido") ?? "";
  if (!esCodigoPedido(pedido)) return NextResponse.json({ error: "Pedido no válido" }, { status: 400 });
  const { ficheros, aviso } = await planteamientosDe(pedido);
  return NextResponse.json(
    {
      modo: modoImpresion(),
      ficheros: ficheros.map(({ nombre, paginas, todoA4 }) => ({ nombre, paginas, todoA4 })),
      aviso,
      impresiones: leerImpresionesDe(pedido),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
