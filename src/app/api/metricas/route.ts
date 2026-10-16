import { NextResponse } from "next/server";
import { INICIO_METRICAS, calcularMetricas } from "@/lib/metricas";
import { calcularCuadroMetricas } from "@/lib/metricas-cuadro";
import { operariosDeSeccion } from "@/lib/server/operarios";
import { leerCausasDevolucion, leerMovimientosMetricas, leerPasosRevision } from "@/lib/server/estado-db";
import { leerIntervalosMetricas } from "@/lib/server/fichaje-db";
import { SECCION_POR_DEFECTO, esSeccionId } from "@/lib/secciones";
import { soloConSesion } from "@/lib/server/sesion";

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
  const corte = soloConSesion(req);
  if (corte) return corte;

  const q = new URL(req.url).searchParams;
  try {
    // Los números son DE UNA SECCIÓN. El "1 de cada 3 vuelve" de Oficina
    // Técnica es suyo: mezclarle las devoluciones de Diseño Gráfico lo haría
    // incomparable con el de agosto y no diría nada de ninguno de los dos.
    // Sin sección se sirve la de siempre, que es lo que había.
    const pedida = q.get("seccion");
    const seccion = esSeccionId(pedida) ? pedida : SECCION_POR_DEFECTO;
    // Nada antes de que la web estuviera en uso (ver INICIO_METRICAS), pida
    // el periodo que pida — también «Todo».
    const inicio = limite(INICIO_METRICAS)!;
    const pedido = limite(q.get("desde"));
    const desde = pedido && pedido > inicio ? pedido : inicio;
    const hasta = limite(q.get("hasta"), true);
    const movs = leerMovimientosMetricas(desde, hasta, seccion);
    // El fichaje va con los movimientos porque responde a la otra mitad de la
    // pregunta: los movimientos dicen cuánto tardó, el fichaje cuánto se
    // trabajó. Separadas, "corregir tarda dos días" hace pensar en poner más
    // gente cuando son veinte minutos repartidos en dos días de espera.
    const intervalos = leerIntervalosMetricas(desde, hasta, seccion);
    // El contexto solo atribuye autores y mide ciclos completos: no altera
    // los totales de sección, que siguen filtrándose por quien firma.
    const cuadro = calcularCuadroMetricas(movs, leerMovimientosMetricas(undefined, hasta), operariosDeSeccion(seccion), {
      desde: desde.slice(0, 10), hasta: limite(q.get("hasta"))?.slice(0, 10) ?? "",
    });
    return NextResponse.json(
      {
        metricas: calcularMetricas(movs, intervalos),
        cuadro,
        causas: leerCausasDevolucion(true),
        // Para poner nombre al «qué paso falla». Con los retirados: una
        // devolución de hace meses puede apuntar a uno que ya no se pide.
        pasos: leerPasosRevision(true).map((p) => ({ id: p.id, texto: p.texto })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[metricas] no se pudieron calcular:", (e as Error).message);
    return NextResponse.json({ error: "No se pudieron calcular las métricas" }, { status: 500 });
  }
}
