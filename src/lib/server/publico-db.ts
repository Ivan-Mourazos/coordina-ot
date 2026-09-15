import sql from "mssql";
import { getPool } from "./db";
import { asegurarIndice, indiceSiListo } from "./historial-indice";
import { leerHistorialPedidoDetalle } from "./historial-db";
import { nombresHistorial } from "./nombres-historial";
import { claveFase, ultimosMovimientos, type UltimoMovimiento } from "./olanet-movimientos";
import { recursosSql, SECCIONES, SECCION_POR_DEFECTO } from "../secciones";
import {
  detalleConsulta,
  detallePublico,
  filtrarPublico,
  frasePublica,
  type FiltrosPublicos,
  type PedidoConsultaDetalle,
  type PedidoPublico,
  type PedidoPublicoDetalle,
} from "../publico";
import {
  diaIso,
  estadoEfectivo,
  filtrarConsulta,
  pedidoConsulta,
  situacionDe,
  type FiltrosConsulta,
  type PedidoConsulta,
  type RespuestaConsulta,
  type SituacionPedido,
} from "../consulta";
import { dondeEstaPedido, type DondeOF, type TareaConEstado } from "../consulta-donde";
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

/** El rescate de OT como fragmento SQL, para usar EXACTAMENTE el mismo texto
 *  en las dos consultas que lo necesitan (`centrosDe`, que filtra lo abierto
 *  para decidir qué centros enseñar en la lista, y `tareasCerradasDe`, que
 *  necesita el booleano tarea a tarea para la ficha del invitado). Requiere
 *  `t` (CPRMOTask) en el FROM de quien lo use.
 *
 *  Una tarea NUESTRA al 100 % cuenta como terminada aunque OLANET no lo diga
 *  (ver historial-finalizacion-sql.ts).
 *
 *  OJO: recursosSql(SECCIONES[SECCION_POR_DEFECTO]) y NO
 *  recursosDeLaWebSql(). Parece que tocaría la de las dos secciones (así junta
 *  'a-otec','otec-a','a-dgra','dgra-a'), pero el índice que decide quién es
 *  "pendiente" (estaPendiente, en publico.ts) se construye con
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

/** Los centros abiertos de una página entera.
 *
 *  «Abierta» se mide EXACTAMENTE como la mide el índice: sin cierre en
 *  `tgm_estadosof_olanet` (idestadoof = 3), más el rescate de las tareas de la
 *  web al 100 % (`rescateOtSql`). Con otra regla, un pedido podría salir en la
 *  lista de pendientes sin un solo centro debajo. */
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
      AND NOT (${rescateOtSql()})`);
  return agruparCentros(r.recordset);
}

/** Cerrada o abierta, tarea a tarea, para la ficha del invitado (Cambio 4,
 *  task-7d): lo que falta ver es justo lo contrario de "abierta" en
 *  `centrosDe` —MISMA regla, invertida— así que comparte `rescateOtSql` con
 *  ella a propósito: con otra copia, tarde o temprano una de las dos cambia y
 *  la ficha dice que falta un paso que la lista ya da por hecho (o al revés).
 *
 *  Claves `orden:tarea` con `CodManufacturingOrder` y `CodMOTask` SIN más
 *  normalizar (ver `claveTarea` en lib/publico.ts): son las mismas columnas,
 *  sin tocar, que ya trae `leerHistorialPedido` para `HistorialOF.codigo` y
 *  `tarea.codigo`. */
export async function tareasCerradasDe(pedido: string): Promise<Map<string, boolean>> {
  const pool = await getPool();
  const r = await pool.request().input("pedido", pedido).query<{
    orden: string | null;
    tarea: string | null;
    cerrada: number;
  }>(`
    SELECT mo.CodManufacturingOrder AS orden, t.CodMOTask AS tarea,
      CASE WHEN e.fin IS NOT NULL OR (${rescateOtSql()}) THEN 1 ELSE 0 END AS cerrada
    FROM dbo.FACOrderSL o
    JOIN dbo.FACOrderLineSL l ON l.IDOrder = o.IDOrder
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = l.IDManufacturingOrder
      AND mo.CodCompany = '001'
    JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
    LEFT JOIN (
      SELECT orden, fase, MAX(fecha_cambio) AS fin
      FROM dbo.tgm_estadosof_olanet WHERE idestadoof = 3 GROUP BY orden, fase
    ) e ON e.orden = mo.CodManufacturingOrder AND e.fase = t.CodMOTask
    WHERE o.CodCompany = '001' AND o.CodOrder = @pedido
  `);
  const mapa = new Map<string, boolean>();
  for (const fila of r.recordset) {
    const orden = (fila.orden ?? "").trim();
    const tarea = (fila.tarea ?? "").trim();
    if (!orden || !tarea) continue;
    mapa.set(`${orden}:${tarea}`, fila.cerrada === 1);
  }
  return mapa;
}

/** El detalle de un pedido para quien no tiene sesión: cabecera, OF y tareas
 *  ya recortadas (`detallePublico`, lib/publico.ts) con el cierre de cada
 *  tarea puesto. En mock no hay RPS que consultar —y el mock ni siquiera
 *  genera `tareas` por OF (ver `detalleMock`, historial-db.ts)—, así que el
 *  mapa de cierres se queda vacío: es justo lo que hace `detallePublico` por
 *  defecto. */
export async function leerDetallePublico(pedido: string): Promise<PedidoPublicoDetalle> {
  const [detalle, cerradas] = await Promise.all([
    leerHistorialPedidoDetalle(pedido),
    ES_MOCK ? Promise.resolve(new Map<string, boolean>()) : tareasCerradasDe(pedido),
  ]);
  return detallePublico(detalle, cerradas);
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
      ciudadEntrega: info?.ciudadEntrega ?? null,
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
      ciudadEntrega: p.ciudadEntrega ?? null,
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
    LEFT JOIN (
      SELECT orden, fase, MAX(fecha_cambio) AS fin
      FROM dbo.tgm_estadosof_olanet WHERE idestadoof = 3 GROUP BY orden, fase
    ) e ON e.orden = mo.CodManufacturingOrder AND e.fase = t.CodMOTask
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
  const hoy = hoyISO();
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
  const b = indiceSiListo()?.base[SECCION_POR_DEFECTO].find((x) => x.pedido === pedido) ?? null;
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
