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
import { estaFinalizado, hoyISO } from "../types";

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
      --
      -- El rescate mira la TAREA (EXISTS), no la fila de rm que se está
      -- enseñando: el índice (ctesFinalizacionHistorial, CTE Recursos) lo
      -- hace por tarea, con DISTINCT IDMOTask, y las otras cinco consultas
      -- del repo que rescatan (historial-db.ts:284-285, :603, :606, y los
      -- planes de julio) usan el mismo EXISTS. Si aquí se mirara la fila,
      -- una tarea con dos filas de rm en centros distintos (una A-OTEC al
      -- 100 % y otra en CALDERERIA) quedaría rescatada por la de A-OTEC y
      -- CALDERERIA no volvería a salir como centro abierto, aunque el
      -- índice diera la tarea entera por terminada igual. Medido el
      -- 14/09/2026 contra RPS: las 28.534 tareas de 2026 tienen EXACTAMENTE
      -- una fila en CPRMOResourceMachine y no hay ninguna, en toda la
      -- historia, que mezcle un centro de OT con otro distinto — pero el
      -- código no puede depender de que esa propiedad de los datos se
      -- mantenga, así que se escribe igual que las otras cinco.
      AND NOT (
        EXISTS (
          SELECT 1 FROM dbo.CPRMOResourceMachine rescate
          WHERE rescate.IDMOTask = t.IDMOTask
            AND rescate.CodMOResourceMachine IN (${recursosSql(SECCIONES[SECCION_POR_DEFECTO])})
        )
        AND COALESCE(t.Description, '') NOT LIKE 'PLANTEAR EN TALLER%'
        AND t.PercentProgress >= 100
      )`);
  return agruparCentros(r.recordset);
}

/** La lista todavía no está: el índice de 153.000 pedidos se está
 *  construyendo, y tarda unos 35 s.
 *
 *  Es un error APARTE y no uno cualquiera porque no significa lo mismo: no es
 *  que algo falle, es que hay que esperar. Lo levanta el arranque
 *  (`precalentarHistorial` en instrumentation.ts), así que esta ventana solo
 *  existe el primer medio minuto tras un despliegue — justo cuando alguien
 *  entra a mirar si ya está la web nueva. Contestarle «no se pudieron cargar
 *  los pedidos» sería mentirle: parecería que la consulta está rota. */
export class ListaEnConstruccion extends Error {
  constructor() {
    super("La lista de pedidos todavía se está construyendo");
    this.name = "ListaEnConstruccion";
  }
}

/** La página del invitado: el índice filtrado, con sus centros puestos. */
export async function leerPaginaPublica(
  f: FiltrosPublicos,
): Promise<{ pedidos: PedidoPublico[]; hasMore: boolean; vencidos?: number }> {
  if (ES_MOCK) return paginaMock(f);

  await asegurarIndice();
  const indice = indiceSiListo();
  // Sin índice no hay lista: la consulta de respaldo del Historial recalcula
  // toda la historia (3,8 s) y esta pantalla la mira la casa entera. Mejor
  // decir que todavía no que tumbar RPS.
  if (!indice) throw new ListaEnConstruccion();

  // "hoy" se decide UNA vez aquí y se pasa entero: es lo que separa lo
  // vencido de lo que viene (ver el bloque de filtrarPublico en publico.ts).
  const { filas, hasMore, vencidos } = filtrarPublico(indice, f, hoyISO());
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
  return { pedidos, hasMore, ...(vencidos !== undefined ? { vencidos } : {}) };
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
function paginaMock(f: FiltrosPublicos): { pedidos: PedidoPublico[]; hasMore: boolean; vencidos?: number } {
  const pendientes = f.lista === "pendientes";
  let elegidos = PEDIDOS.filter((p) => estaFinalizado(p) !== pendientes);

  // Mismo apartado de vencidos que en RPS (ver filtrarPublico, publico.ts):
  // el mock también arranca con `soloVencidos` en la URL, así que sin esto la
  // pantalla de desarrollo mentiría al enseñar la misma lista para las dos
  // pestañas del apartado.
  let vencidos: number | undefined;
  if (pendientes) {
    const hoy = hoyISO();
    const esVencido = (p: (typeof PEDIDOS)[number]) => !!p.fechaEntrega && p.fechaEntrega < hoy;
    if (f.soloVencidos) {
      elegidos = elegidos.filter(esVencido);
    } else {
      vencidos = elegidos.filter(esVencido).length;
      elegidos = elegidos.filter((p) => !esVencido(p));
    }
  }

  const pedidos = elegidos.map((p): PedidoPublico => {
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
  return { pedidos, hasMore: false, ...(vencidos !== undefined ? { vencidos } : {}) };
}
