import { NextResponse } from "next/server";
import { calcularMetricas } from "@/lib/metricas";
import { leerCausasDevolucion, leerMovimientosMetricas } from "@/lib/server/estado-db";
import { SECCION_POR_DEFECTO, esSeccionId } from "@/lib/secciones";

// ─── /api/metricas ───────────────────────────────────────────────────────────
// Cuántas OF vuelven y por qué. Todo sale del registro de acciones y de la
// tabla de causas, o sea de NUESTRA base: no toca RPS, así que responde rápido
// y se puede recargar sin miedo (la vista de RPS tarda de 7 a 15 s).
//
// Las causas viajan con la respuesta, no aparte: sin sus rótulos la lista de
// ids no dice nada, y pedirlas en dos consultas para pintar una sola pantalla
// solo daría ocasión de enseñarla a medias. Van TODAS, retiradas incluidas —
// una devolución de hace meses puede apuntar a una que ya no se ofrece.

export const dynamic = "force-dynamic";

/** Un día en ISO, o null. El `hasta` del formulario es inclusivo —"hasta el 31"
 *  significa con el 31 dentro— y la consulta compara con `<`, así que se pasa
 *  al día siguiente. Sin esto se perdería siempre el último día, que es el
 *  fallo clásico de los filtros por fecha. */
function limite(v: string | null, siguiente = false): string | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  if (siguiente) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  try {
    // Los números son DE UNA SECCIÓN. El "1 de cada 3 vuelve" de Oficina
    // Técnica es suyo: mezclarle las devoluciones de Diseño Gráfico lo haría
    // incomparable con el de agosto y no diría nada de ninguno de los dos.
    // Sin sección se sirve la de siempre, que es lo que había.
    const pedida = q.get("seccion");
    const movs = leerMovimientosMetricas(
      limite(q.get("desde")),
      limite(q.get("hasta"), true),
      esSeccionId(pedida) ? pedida : SECCION_POR_DEFECTO,
    );
    return NextResponse.json(
      { metricas: calcularMetricas(movs), causas: leerCausasDevolucion(true) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[metricas] no se pudieron calcular:", (e as Error).message);
    return NextResponse.json({ error: "No se pudieron calcular las métricas" }, { status: 500 });
  }
}
