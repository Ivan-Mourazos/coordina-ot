import { NextResponse } from "next/server";
import { INICIO_METRICAS, calcularMetricas } from "@/lib/metricas";
import { calcularCuadroMetricas } from "@/lib/metricas-cuadro";
import { calcularDetalleMetricas, contarEntregas } from "@/lib/metricas-personales";
import { leerFamiliasMetricas, leerIncidenciasMetricas } from "@/lib/server/metricas-fuentes";
import { operariosDeSeccion } from "@/lib/server/operarios";
import { leerCausasDevolucion, leerMovimientosMetricas, leerPasesMetricas, leerPasosRevision } from "@/lib/server/estado-db";
import { leerIntervalosMetricas } from "@/lib/server/fichaje-db";
import { SECCION_POR_DEFECTO, esSeccionId } from "@/lib/secciones";
import { loginActivo, quienEs, soloConSesion } from "@/lib/server/sesion";
import { hoyISO } from "@/lib/types";

// ─── /api/metricas ───────────────────────────────────────────────────────────
// Los totales y comparaciones salen del registro local. El detalle añade
// familias e incidencias de RPS, con consultas independientes de la vista del
// tablero. Un fallo de esas fuentes no oculta las métricas locales.
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
    const historico = leerMovimientosMetricas(undefined, hasta);
    const periodo = { desde: desde.slice(0, 10), hasta: limite(q.get("hasta"))?.slice(0, 10) ?? hoyISO() };
    // Las gráficas enseñan el AÑO del periodo elegido (Iván, 21/10/2026), sin
    // pasar de hoy ni empezar antes de que hubiera registro.
    const anio = periodo.desde.slice(0, 4);
    const finAnio = `${anio}-12-31`;
    const periodoGrafica = {
      desde: `${anio}-01-01` > INICIO_METRICAS ? `${anio}-01-01` : INICIO_METRICAS,
      hasta: finAnio < hoyISO() ? finAnio : hoyISO(),
    };
    const movimientosGrafica = leerMovimientosMetricas(limite(periodoGrafica.desde), limite(periodoGrafica.hasta, true), seccion);
    const equipo = operariosDeSeccion(seccion);
    const cuadroMes = calcularCuadroMetricas(movs, historico, equipo, periodo);
    const cuadroGrafica = calcularCuadroMetricas(movimientosGrafica, historico, equipo, periodoGrafica);
    // Las tarjetas y los desgloses son del mes seleccionado. Las gráficas
    // comparan meses hasta ese mes, siempre con el mismo filtro de sección.
    const cuadro = { ...cuadroMes, meses: cuadroGrafica.meses, tendencia: cuadroGrafica.tendencia };
    let detalle;
    if (q.get("detalle") === "1") {
      // Con login, la identidad viene de la sesión: el navegador no puede
      // pedir las correcciones o incidencias privadas de otro compañero.
      const miId = loginActivo() ? quienEs(req)?.id ?? "" : q.get("operario") ?? "";
      const [familias, incidencias] = await Promise.allSettled([
        leerFamiliasMetricas(movimientosGrafica),
        leerIncidenciasMetricas(periodoGrafica, miId, seccion),
      ]);
      if (familias.status === "rejected") console.error("[metricas] familias no disponibles:", familias.reason?.message);
      if (incidencias.status === "rejected") console.error("[metricas] incidencias no disponibles:", incidencias.reason?.message);
      const porFamilia = familias.status === "fulfilled" ? familias.value : new Map();
      const bonos = incidencias.status === "fulfilled" ? incidencias.value : null;
      const meses = cuadro.meses.map((m) => m.mes);
      detalle = calcularDetalleMetricas(movs, historico, porFamilia, bonos, miId, periodo, meses, familias.status === "fulfilled");
      detalle.personal.meses = calcularDetalleMetricas(movimientosGrafica, historico, porFamilia, bonos, miId, periodoGrafica, meses, familias.status === "fulfilled").personal.meses;
    }
    return NextResponse.json(
      {
        // Los pases solo los usa el cronómetro («hasta Producción»).
        metricas: calcularMetricas(
          [...movs, ...leerPasesMetricas(desde, hasta, seccion)].sort((a, b) => a.at.localeCompare(b.at)),
          intervalos,
        ),
        // Cada técnico ve lo suyo (Iván, 21/10/2026): el reparto por técnico
        // no sale de aquí. Se sigue calculando para una vista del encargado.
        cuadro: { ...cuadro, porTecnico: [] },
        entregas: contarEntregas(movs),
        ...(detalle ? { detalle } : {}),
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
