import { getPool } from "./db";
import { asegurarIndice, indiceSiListo } from "./historial-indice";
import { recursosSql, SECCIONES, SECCION_POR_DEFECTO } from "../secciones";
import {
  filtrarPublico,
  frasePublica,
  type FiltrosPublicos,
  type PedidoPublico,
} from "../publico";
import { PEDIDOS } from "../mock";
import { estaFinalizado } from "../types";

// ─── La consulta sin login: acceso a RPS (solo lectura) ──────────────────────
// El índice en memoria (historial-indice.ts) dice QUÉ pedidos salen; esta
// consulta dice por dónde van. Se pide para las 40 filas de la página de una
// vez: una consulta por pedido serían 40 idas y vueltas.

const ES_MOCK = process.env.DATASOURCE !== "rps";

const iso = (ms: number | null): string | null =>
  ms === null ? null : new Date(ms).toISOString().slice(0, 10);

/** Pedido → centros con tarea abierta, por DESCRIPCIÓN y sin repetir.
 *  Ver el test: el mismo centro tiene dos códigos en RPS. */
export function agruparCentros(
  filas: readonly { pedido: string | null; centro: string | null }[],
): Map<string, string[]> {
  const mapa = new Map<string, Set<string>>();
  for (const f of filas) {
    const pedido = (f.pedido ?? "").trim();
    const centro = (f.centro ?? "").trim();
    if (!pedido || !centro) continue;
    let suyos = mapa.get(pedido);
    if (!suyos) {
      suyos = new Set();
      mapa.set(pedido, suyos);
    }
    suyos.add(centro);
  }
  return new Map([...mapa].map(([pedido, set]) => [pedido, [...set].sort()]));
}

/** Los centros abiertos de una página entera.
 *
 *  «Abierta» se mide EXACTAMENTE como la mide el índice: sin cierre en
 *  `tgm_estadosof_olanet` (idestadoof = 3), más el rescate de las tareas de la
 *  web al 100 %. Con otra regla, un pedido podría salir en la lista de
 *  pendientes sin un solo centro debajo. */
async function centrosDe(pedidos: readonly string[]): Promise<Map<string, string[]>> {
  if (pedidos.length === 0) return new Map();
  const pool = await getPool();
  const req = pool.request();
  const marcas = pedidos.map((p, i) => {
    req.input(`p${i}`, p);
    return `@p${i}`;
  });
  const r = await req.query<{ pedido: string | null; centro: string | null }>(`
    SELECT DISTINCT o.CodOrder AS pedido, rm.Description AS centro
    FROM dbo.FACOrderSL o
    JOIN dbo.FACOrderLineSL l ON l.IDOrder = o.IDOrder
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = l.IDManufacturingOrder
      AND mo.CodCompany = '001'
    JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
    JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = t.IDMOTask
    LEFT JOIN (
      SELECT orden, fase, MAX(fecha_cambio) AS fin
      FROM dbo.tgm_estadosof_olanet WHERE idestadoof = 3 GROUP BY orden, fase
    ) e ON e.orden = mo.CodManufacturingOrder AND e.fase = t.CodMOTask
    WHERE o.CodCompany = '001' AND o.CodOrder IN (${marcas.join(",")})
      AND e.fin IS NULL
      -- El rescate de OT: una tarea NUESTRA al 100 % está terminada aunque
      -- OLANET no lo diga (ver historial-finalizacion-sql.ts).
      --
      -- OJO: recursosSql(SECCIONES[SECCION_POR_DEFECTO]) y NO
      -- recursosDeLaWebSql(). Parece que tocaría la de las dos secciones
      -- (así junta 'a-otec','otec-a','a-dgra','dgra-a'), pero el índice que
      -- decide quién es "pendiente" (estaPendiente, en publico.ts) se
      -- construye con ctesFinalizacionHistorial(SECCION_POR_DEFECTO), y ahí
      -- el rescate SOLO alcanza a los recursos de esa sección ('a-otec',
      -- 'otec-a'); para diseño el rescate está apagado del todo
      -- (rescateOt = "1=0"). Con recursosDeLaWebSql() aquí, un pedido con su
      -- única tarea abierta en A-DGRA al 100 % (sin cierre en OLANET) salía
      -- "pendiente" en el índice pero esta consulta lo daba por rescatado, y
      -- la fila decía "Entregado" dentro de la lista de los que no lo están.
      AND NOT (
        rm.CodMOResourceMachine IN (${recursosSql(SECCIONES[SECCION_POR_DEFECTO])})
        AND COALESCE(t.Description, '') NOT LIKE 'PLANTEAR EN TALLER%'
        AND t.PercentProgress >= 100
      )`);
  return agruparCentros(r.recordset);
}

/** La página del invitado: el índice filtrado, con sus centros puestos. */
export async function leerPaginaPublica(
  f: FiltrosPublicos,
): Promise<{ pedidos: PedidoPublico[]; hasMore: boolean }> {
  if (ES_MOCK) return paginaMock(f);

  await asegurarIndice();
  const indice = indiceSiListo();
  // Sin índice no hay lista: la consulta de respaldo del Historial recalcula
  // toda la historia (3,8 s) y esta pantalla la mira la casa entera. Mejor
  // decir que no se pudo que tumbar RPS.
  if (!indice) throw new Error("La lista de pedidos todavía se está construyendo");

  const { filas, hasMore } = filtrarPublico(indice, f);
  const centros = f.lista === "pendientes"
    ? await centrosDe(filas.map((b) => b.pedido))
    : new Map<string, string[]>();

  const pedidos = filas.map((b): PedidoPublico => {
    const info = indice.info.get(b.pedido);
    const suyos = centros.get(b.pedido) ?? [];
    return {
      codigo: b.pedido,
      cliente: info?.cliente ?? null,
      negocio: info?.negocio ?? null,
      fechaPedido: iso(b.fechaPedido),
      fechaEntrega: iso(b.fechaEntrega),
      fechaFinalizacion: iso(b.finalizada),
      nOf: b.nOf,
      pendiente: f.lista === "pendientes",
      pendienteEntrega: b.pendienteEntrega,
      centros: suyos,
      estado: frasePublica(suyos, b.pendienteEntrega),
    };
  });
  return { pedidos, hasMore };
}

/** Sin base de datos (DATASOURCE distinto de "rps"): la web de desarrollo
 *  tiene que arrancar igual, como ya hace el Historial.
 *
 *  El brief original filtraba por `p.situacion === "completado"`, pero ese
 *  valor lo pone el overlay guardado en SQLite (server/overlay.ts) y nunca
 *  vive en `PEDIDOS`: los pedidos "Historial" del mock traen `situacion:
 *  "procesado"` igual que los que siguen abiertos, así que esa comparación no
 *  distinguía nada y la lista de "realizados" salía siempre vacía. Se usa en
 *  su lugar `estaFinalizado` (types.ts), la MISMA regla que ya separa "sin
 *  trabajo de OT pendiente" en el resto de la web (todas las OF activas
 *  aprobadas), y que sí es cierta para esos tres pedidos del mock.
 *
 *  `fechaCreacion` tampoco lo trae ningún pedido del mock (solo existe para
 *  cuando RPS lo manda): se cae a `fechaSolicitud`, que sí tienen todos, para
 *  no enseñar una fecha en blanco en cada fila. */
function paginaMock(f: FiltrosPublicos): { pedidos: PedidoPublico[]; hasMore: boolean } {
  const pendientes = f.lista === "pendientes";
  const pedidos = PEDIDOS.filter((p) => estaFinalizado(p) !== pendientes).map((p): PedidoPublico => {
    const centros = pendientes ? ["OFICINA TECNICA ARZUA"] : [];
    return {
      codigo: p.codigo,
      cliente: p.cliente ?? null,
      negocio: null,
      fechaPedido: p.fechaCreacion ?? p.fechaSolicitud ?? null,
      fechaEntrega: p.fechaEntrega ?? null,
      fechaFinalizacion: null,
      nOf: p.ofs.length,
      pendiente: pendientes,
      pendienteEntrega: pendientes,
      centros,
      estado: frasePublica(centros, pendientes),
    };
  });
  return { pedidos, hasMore: false };
}
