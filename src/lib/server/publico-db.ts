import sql from "mssql";
import { getPool } from "./db";
import { asegurarIndice, indiceSiListo } from "./historial-indice";
import { leerHistorialPedidoDetalle } from "./historial-db";
import { nombresHistorial } from "./nombres-historial";
import { claveFase, ultimosMovimientos, type UltimoMovimiento } from "./olanet-movimientos";
import { recursosSql, SECCIONES, SECCION_POR_DEFECTO } from "../secciones";
import { detalleConsulta, type PedidoConsultaDetalle } from "../publico";
import {
  diaIso,
  estadoEfectivo,
  filaDelIndice,
  filtrarConsulta,
  hoyEnOficina,
  pedidoConsulta,
  situacionDe,
  type FiltrosConsulta,
  type PedidoConsulta,
  type RespuestaConsulta,
  type SituacionPedido,
} from "../consulta";
import { dondeEstaPedido, type DondeOF, type TareaConEstado } from "../consulta-donde";
import { PEDIDOS } from "../mock";
import { estaFinalizado } from "../types";

// ─── La consulta sin login: acceso a RPS y OLANET (solo lectura) ─────────────
// El índice en memoria (historial-indice.ts) dice QUÉ pedidos salen y en qué
// situación; esto dice por dónde va cada uno en fábrica y quién lo tiene. Se
// pide para las 40 filas de la página de una vez: una consulta por pedido
// serían 40 idas y vueltas.

const ES_MOCK = process.env.DATASOURCE !== "rps";

/** El rescate de OT como fragmento SQL: `tareasDePedidos` tiene que dar por
 *  cerrada EXACTAMENTE la misma tarea que el índice
 *  (`ctesFinalizacionHistorial`), o un pedido que la lista da por «en fábrica»
 *  no tendría dónde estar. Requiere `t` (CPRMOTask) en el FROM de quien lo use.
 *
 *  Una tarea NUESTRA al 100 % cuenta como terminada aunque OLANET no lo diga
 *  (ver historial-finalizacion-sql.ts).
 *
 *  OJO: recursosSql(SECCIONES[SECCION_POR_DEFECTO]) y NO
 *  recursosDeLaWebSql(). Parece que tocaría la de las dos secciones (así junta
 *  'a-otec','otec-a','a-dgra','dgra-a'), pero el índice que decide quién es
 *  "pendiente" (situacionDe, en consulta.ts) se construye con
 *  ctesFinalizacionHistorial(SECCION_POR_DEFECTO), y ahí el rescate SOLO
 *  alcanza a los recursos de esa sección ('a-otec', 'otec-a'); para diseño el
 *  rescate está apagado del todo (rescateOt = "1=0"). Con
 *  recursosDeLaWebSql() aquí, un pedido con su única tarea abierta en A-DGRA
 *  al 100 % (sin cierre en OLANET) salía "pendiente" en el índice pero esta
 *  consulta lo daba por rescatado, y la fila decía "Entregado" dentro de la
 *  lista de los que no lo están.
 *
 *  El rescate mira la TAREA (EXISTS), no la fila de rm que se está
 *  enseñando: el índice (ctesFinalizacionHistorial, CTE Recursos) lo hace por
 *  tarea, con DISTINCT IDMOTask, y las otras cinco consultas del repo que
 *  rescatan (historial-db.ts:284-285, :603, :606, y los planes de julio) usan
 *  el mismo EXISTS. Si aquí se mirara la fila, una tarea con dos filas de rm
 *  en centros distintos (una A-OTEC al 100 % y otra en CALDERERIA) quedaría
 *  rescatada por la de A-OTEC y CALDERERIA no volvería a salir como centro
 *  abierto, aunque el índice diera la tarea entera por terminada igual.
 *  Medido el 14/09/2026 contra RPS: las 28.534 tareas de 2026 tienen
 *  EXACTAMENTE una fila en CPRMOResourceMachine y no hay ninguna, en toda la
 *  historia, que mezcle un centro de OT con otro distinto — pero el código no
 *  puede depender de que esa propiedad de los datos se mantenga, así que se
 *  escribe igual que las otras cinco. */
function rescateOtSql(): string {
  return `EXISTS (
        SELECT 1 FROM dbo.CPRMOResourceMachine rescate
        WHERE rescate.IDMOTask = t.IDMOTask
          AND rescate.CodMOResourceMachine IN (${recursosSql(SECCIONES[SECCION_POR_DEFECTO])})
      )
      AND COALESCE(t.Description, '') NOT LIKE 'PLANTEAR EN TALLER%'
      AND t.PercentProgress >= 100`;
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

// ─── Segunda versión: dónde está y quién lo tiene ───────────────────────────

interface FilaTarea {
  pedido: string | null;
  orden: string | null;
  tarea: string | null;
  descripcion: string | null;
  centro: string | null;
  es_fin: number;
  cerrada: number;
}

/** Las tareas de las OF de esos pedidos, con si son FINALIZAR y si están
 *  cerradas, con la MISMA regla que el índice (historial-finalizacion-sql.ts:
 *  Finalizacion, es_fin, terminada). Con otra regla, un pedido que la lista da
 *  por «en fábrica» podría no tener dónde estar. */
async function tareasDePedidos(pedidos: readonly string[]): Promise<FilaTarea[]> {
  const pool = await getPool();
  const req = pool.request();
  const marcas = pedidos.map((p, i) => {
    req.input(`p${i}`, sql.VarChar(25), p);
    return `@p${i}`;
  });
  const r = await req.query<FilaTarea>(`
    SELECT DISTINCT o.CodOrder AS pedido, mo.CodManufacturingOrder AS orden,
      t.CodMOTask AS tarea, t.Description AS descripcion, c.centro,
      CASE WHEN EXISTS (
          SELECT 1 FROM dbo.CPRMOResourceMachine fz
          WHERE fz.IDMOTask = t.IDMOTask AND UPPER(COALESCE(fz.Description,'')) LIKE '%FINALIZ%'
        ) OR UPPER(COALESCE(t.Description,'')) LIKE '%FINALIZ%' THEN 1 ELSE 0 END AS es_fin,
      CASE WHEN e.fin IS NOT NULL OR (${rescateOtSql()}) THEN 1 ELSE 0 END AS cerrada
    FROM dbo.FACOrderSL o
    JOIN dbo.FACOrderLineSL l ON l.IDOrder = o.IDOrder
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = l.IDManufacturingOrder
      AND mo.CodCompany = '001'
    JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
    -- Todas las tareas de 2026 tienen exactamente un centro (medido el
    -- 14/09/2026); el TOP 1 es por si un día no.
    OUTER APPLY (
      SELECT TOP 1 rm.Description AS centro FROM dbo.CPRMOResourceMachine rm
      WHERE rm.IDMOTask = t.IDMOTask ORDER BY rm.Description
    ) c
    -- Correlacionado y no un agregado de toda la tabla: aquí son 40 pedidos, y
    -- agrupar los cierres de la casa entera para cruzar cuarenta filas es lo
    -- que en el índice costó 97 s contra 45 (ver el CTE Albaranes).
    OUTER APPLY (
      SELECT MAX(x.fecha_cambio) AS fin FROM dbo.tgm_estadosof_olanet x
      WHERE x.idestadoof = 3 AND x.orden = mo.CodManufacturingOrder AND x.fase = t.CodMOTask
    ) e
    WHERE o.CodCompany = '001' AND o.CodOrder IN (${marcas.join(",")})`);
  return r.recordset;
}

/** Pedido → dónde está cada OF con trabajo. Si OLANET no contesta, sin nombres
 *  ni pausas, pero con el «siguiente» que sale de RPS: una pantalla con menos
 *  detalle antes que un error. */
export async function leerDonde(pedidos: readonly string[]): Promise<Map<string, DondeOF[]>> {
  const salida = new Map<string, DondeOF[]>();
  if (pedidos.length === 0) return salida;
  const filas = await tareasDePedidos(pedidos);
  const ordenes = filas.map((f) => (f.orden ?? "").trim()).filter(Boolean);
  const [movimientos, nombres] = await Promise.all([
    ultimosMovimientos(ordenes).catch((e) => {
      console.warn("[consulta] OLANET no contesta, sale sin nombres:", (e as Error).message);
      return new Map<string, UltimoMovimiento>();
    }),
    nombresHistorial().catch(() => new Map<string, string>()),
  ]);

  const porPedido = new Map<string, TareaConEstado[]>();
  for (const f of filas) {
    const pedido = (f.pedido ?? "").trim();
    const orden = (f.orden ?? "").trim();
    const codigo = (f.tarea ?? "").trim();
    if (!pedido || !orden || !codigo) continue;
    const m = movimientos.get(claveFase(orden, codigo));
    const tarea: TareaConEstado = {
      orden,
      codigo,
      descripcion: f.descripcion ?? "",
      centro: f.centro?.trim() || null,
      esFinalizar: f.es_fin === 1,
      cerrada: f.cerrada === 1,
      movimiento: m
        ? {
            estado: m.estado,
            nombre: m.operario ? (nombres.get(m.operario) ?? null) : null,
            desde: m.fecha ? diaIso(m.fecha.getTime()) : null,
          }
        : null,
    };
    const suyas = porPedido.get(pedido);
    if (suyas) suyas.push(tarea);
    else porPedido.set(pedido, [tarea]);
  }
  for (const [pedido, tareas] of porPedido) salida.set(pedido, dondeEstaPedido(tareas));
  return salida;
}

/** La página del invitado: el índice filtrado y, para lo que está en fábrica,
 *  dónde está. */
export async function leerPaginaConsulta(f: FiltrosConsulta): Promise<RespuestaConsulta> {
  const hoy = hoyEnOficina();
  if (ES_MOCK) return paginaMockConsulta(f, hoy);

  await asegurarIndice();
  const indice = indiceSiListo();
  // Sin índice no hay lista: la consulta de respaldo recalcula toda la
  // historia y esta pantalla la mira la casa entera.
  if (!indice) throw new ListaEnConstruccion();

  const { filas, ...resto } = filtrarConsulta(indice, f, hoy);
  const enFabrica = filas.filter((b) => situacionDe(b) === "fabrica").map((b) => b.pedido);
  const donde = await leerDonde(enFabrica).catch((e) => {
    console.warn("[consulta] no se pudo leer por dónde va cada pedido:", (e as Error).message);
    return new Map<string, DondeOF[]>();
  });
  return {
    ...resto,
    pedidos: filas.map((b) => pedidoConsulta(b, indice.info.get(b.pedido), donde.get(b.pedido) ?? [], hoy)),
  };
}

/** La ficha del invitado. La situación sale del índice si ya está hecho; sin
 *  él, la ficha se enseña igual y sin rótulo de estado. */
export async function leerDetalleConsulta(pedido: string): Promise<PedidoConsultaDetalle> {
  if (ES_MOCK) {
    const detalle = await leerHistorialPedidoDetalle(pedido);
    return detalleConsulta(detalle, { situacion: null, fechaEntregado: null, donde: [] });
  }
  const indice = indiceSiListo();
  const b = indice ? filaDelIndice(indice, pedido) : null;
  const situacion: SituacionPedido | null = b ? situacionDe(b) : null;
  const [detalle, donde] = await Promise.all([
    leerHistorialPedidoDetalle(pedido),
    situacion === "entregado" || situacion === "salir"
      ? Promise.resolve(new Map<string, DondeOF[]>())
      : leerDonde([pedido]).catch(() => new Map<string, DondeOF[]>()),
  ]);
  return detalleConsulta(detalle, {
    situacion,
    fechaEntregado: situacion === "entregado" && b ? diaIso(b.fechaEntregado) : null,
    donde: donde.get(pedido) ?? [],
  });
}

/** Sin RPS (DATASOURCE distinto de "rps"): la web de desarrollo arranca igual.
 *  `estaFinalizado` separa fábrica de esperando salir, como ya hacía la
 *  primera versión; el mock no tiene entregas ni OLANET. */
function paginaMockConsulta(f: FiltrosConsulta, hoy: string): RespuestaConsulta {
  const q = f.q?.trim().toUpperCase() ?? "";
  const pedidos = PEDIDOS
    .filter((p) => !q || p.codigo.includes(q) || (p.cliente ?? "").toUpperCase().includes(q))
    .map((p): PedidoConsulta => {
      const situacion: SituacionPedido = estaFinalizado(p) ? "salir" : "fabrica";
      const fechaEntrega = p.fechaEntrega ?? null;
      return {
        codigo: p.codigo,
        cliente: p.cliente ?? null,
        negocio: null,
        ciudadEntrega: p.ciudadEntrega ?? null,
        situacion,
        fechaEntrega,
        fechaEntregado: null,
        dia: fechaEntrega,
        fueraDePlazo: fechaEntrega !== null && fechaEntrega < hoy,
        familias: [],
        donde: situacion === "fabrica"
          ? [{
              // En mock no hay OF de verdad que enseñar: el código del pedido
              // hace de etiqueta para que la pantalla se pueda mirar.
              orden: p.codigo,
              enCurso: [],
              pausadas: [],
              siguientes: [{ paso: "Oficina Técnica", tarea: "Plantear", quien: null, desde: null }],
            }]
          : [],
      };
    });
  return { pedidos, hasMore: false, familias: [], porDia: null, estado: estadoEfectivo(f) };
}
