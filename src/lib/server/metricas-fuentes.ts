import sql from "mssql";
import { getPool } from "./db";
import { cacheConDisco, type ConDisco } from "./cache-disco";
import { familiaDeTexto } from "./rps";
import { sumarDias } from "../fechas";
import { partirOfId } from "../bonos";
import { PEDIDOS } from "../mock";
import type { MovimientoRegistrado, Periodo } from "../metricas";
import { COORDINA_EN_USO, type IncidenciaMetricas, type PaseRps } from "../metricas-personales";
import { SECCIONES, recursosDeTrabajoSql, recursosSql, type SeccionId } from "../secciones";

/** La familia de producto de una OF, como en el resto de Métricas. Exportado
 *  para las NC (ver nc-db.ts): la misma regla, no una copia. */
export interface FilaFamilia { orden: string; descripcion: string | null; grupo: string | null; subfamilia: string | null; cliente: string | null }
export const familiaDe = (f: FilaFamilia) => familiaDeTexto(f.descripcion, f.grupo, { subfamilia: f.subfamilia, cliente: f.cliente });
export const catalogo = `
  LEFT JOIN dbo.STKArticle a ON a.IDArticle = mo.IDArticle
  LEFT JOIN dbo.GENProductFamily pf ON pf.IDProductFamily = a.IDProductFamily
  LEFT JOIN dbo.GENProductSubFamily sf ON sf.IDProductSubFamily = a.IDProductSubFamily
  OUTER APPLY (SELECT TOP 1 cli.Description AS cliente
    FROM dbo.FACOrderLineSL l
    JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany = '001'
    LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = o.IDCustomer
    WHERE l.IDManufacturingOrder = mo.IDManufacturingOrder
    ORDER BY o.CodOrder) venta`;
export const columnas = `mo.CodManufacturingOrder AS orden, mo.Description AS descripcion,
  pf.CodProductFamily AS grupo, sf.CodProductSubFamily AS subfamilia, venta.cliente`;

const SEIS_HORAS = 6 * 3_600_000;
type OpcionesRps = Pick<ConDisco, "esperarRps" | "forzarRps">;

// La familia es de la OF y se comparte entre sus fases y entre periodos.
const familiasPorOrden = new Map<string, { familia: string; hasta: number }>();
const familiasEnCurso = new Map<string, Promise<void>>();

export async function leerFamiliasMetricas(movs: readonly MovimientoRegistrado[]): Promise<Map<string, string>> {
  const porId = new Map<string, string>();
  if (process.env.DATASOURCE !== "rps") {
    for (const p of PEDIDOS) for (const of of p.ofs) porId.set(of.id, of.familia);
    return porId;
  }
  const ids = new Map(movs.map((m) => [m.ofId, partirOfId(m.ofId)?.of]).filter((e): e is [string, string] => !!e[1]));
  const nuevas: string[] = [];
  const caducadas: string[] = [];
  const pendientes = new Set<Promise<void>>();
  const ahora = Date.now();
  for (const orden of new Set(ids.values())) {
    const guardada = familiasPorOrden.get(orden);
    if (guardada && guardada.hasta > ahora) continue;
    const enCurso = familiasEnCurso.get(orden);
    if (enCurso) {
      if (!guardada) pendientes.add(enCurso);
    } else {
      (guardada ? caducadas : nuevas).push(orden);
    }
  }
  if (nuevas.length) pendientes.add(pedirFamilias(nuevas));
  if (caducadas.length) {
    void pedirFamilias(caducadas).catch((e: Error) => {
      console.warn("[metricas] no se pudieron actualizar las familias:", e.message);
    });
  }
  if (pendientes.size) await Promise.all(pendientes);
  for (const [id, orden] of ids) {
    const guardada = familiasPorOrden.get(orden);
    if (guardada?.familia) porId.set(id, guardada.familia);
  }
  return porId;
}

function pedirFamilias(ordenes: string[]): Promise<void> {
  const consulta = cargarFamilias(ordenes).finally(() => {
    for (const orden of ordenes) familiasEnCurso.delete(orden);
  });
  for (const orden of ordenes) familiasEnCurso.set(orden, consulta);
  return consulta;
}

async function cargarFamilias(ordenes: string[]): Promise<void> {
  const pool = await getPool();
  // Por debajo del límite de parámetros de SQL Server, incluso con «Todo».
  for (let i = 0; i < ordenes.length; i += 500) {
    const req = pool.request();
    const lote = ordenes.slice(i, i + 500);
    const marcas = lote.map((orden, j) => { req.input(`of${j}`, sql.VarChar(50), orden); return `@of${j}`; });
    const r = await req.query<FilaFamilia>(`SELECT ${columnas}
      FROM dbo.CPRManufacturingOrder mo ${catalogo}
      WHERE mo.CodCompany = '001' AND mo.CodManufacturingOrder IN (${marcas.join(",")})`);
    const familias = new Map(r.recordset.map((f) => [f.orden.trim(), familiaDe(f)]));
    const hasta = Date.now() + SEIS_HORAS;
    for (const orden of lote) {
      const familia = familias.get(orden);
      if (familia) familiasPorOrden.set(orden, { familia, hasta });
      else familiasPorOrden.delete(orden);
    }
  }
}

/** Quien más tiempo de OT fichó en la OF, como código de empleado. Es la
 *  atribución del Excel de OT, y la única que hay para lo anterior a Coordina:
 *  la vista apenas conoce las OF recientes (8 de 318 en octubre de 2026). */
const autorRps = `
  OUTER APPLY (SELECT TOP 1 e.CodEmployee AS autor FROM dbo.TGM_FICHAJES_OT f
    JOIN dbo.GENEmployee e ON e.CodCompany = '001' AND e.Description = f.operario
    WHERE f.IDManufacturingOrder = mo.IDManufacturingOrder
    ORDER BY f.tiempoTotal DESC, f.operario) ot`;
type FilaRps = FilaFamilia & { fecha: Date; autor: string | null };
const deFila = (f: FilaRps) => ({ fecha: f.fecha.toISOString().slice(0, 10), orden: f.orden.trim(), familia: familiaDe(f), autor: f.autor?.trim() || null });

interface ReglaIncidencias {
  tipos: string;
  desde?: string;
  soloConTareaPropia?: boolean;
  cache: ReturnType<typeof cacheConDisco<IncidenciaMetricas[]>>;
}

/** Qué improductivo de RPS es una incidencia de cada sección.
 *
 *  · OT: «… ERROR EN PLANTEAMIENTO», sea de corte, confección o soldadura
 *    (Iván, 21/10/2026).
 *  · Diseño: no hay un «error de diseño» en RPS; los que eligió Iván el
 *    26/10/2026 son los de rotulación y el del archivo de impresión. Y solo en
 *    OF con tarea de Diseño: un error de rotulación en una OF que Diseño no
 *    tocó es del taller. Desde el 08/09/2026, que es cuando Diseño empezó a
 *    pasar pedidos en Coordina: antes no hay OF pasadas sobre las que sacar el
 *    %, y salía inflado.
 *
 *  Impresión no tiene: no lleva línea. */
const INCIDENCIAS: Partial<Record<SeccionId, ReglaIncidencias>> = {
  ot: {
    tipos: "unpr.Description LIKE '%ERROR EN PLANTEAMIENTO%'",
    cache: cacheConDisco<IncidenciaMetricas[]>("metricas-incidencias-ot", SEIS_HORAS),
  },
  diseno: {
    tipos: `unpr.Description IN ('ROTULACION-OTROS ERRORES ROTULACION', 'ROTULACION-ERROR AL DOCUMENTAR PEDIDO',
      'ROTULACION-ERROR EN CORTE DE MASCARA O VINILO', 'IMPRESION DIGITAL-ERROR EN ARCHIVO')`,
    desde: "2026-09-08",
    soloConTareaPropia: true,
    cache: cacheConDisco<IncidenciaMetricas[]>("metricas-incidencias-diseno", SEIS_HORAS),
  },
};

/** Las incidencias de la sección (ver `INCIDENCIAS`). De TODO el equipo: a
 *  quién toca cada una lo decide `calcularDetalleMetricas`, que sabe quién la
 *  entregó en Coordina. Una fila por OF y día, aunque haya varios apuntes. */
export async function leerIncidenciasMetricas(
  periodo: Periodo,
  seccion: SeccionId,
  opciones?: OpcionesRps,
): Promise<IncidenciaMetricas[] | null> {
  const regla = INCIDENCIAS[seccion];
  if (process.env.DATASOURCE !== "rps" || !regla) return null;
  const desde = regla.desde && regla.desde > periodo.desde ? regla.desde : periodo.desde;
  if (periodo.hasta && desde > periodo.hasta) return [];
  // Cada sección tiene su fichero. Lo de ayer vale mientras se pide lo de hoy.
  return regla.cache(`${periodo.desde}|${periodo.hasta}`, () => consultarIncidencias(desde, periodo.hasta, seccion, regla), {
    clave: periodo.desde,
    maxEdadMs: 24 * 3_600_000,
    ...opciones,
  });
}

async function consultarIncidencias(
  desde: string, hasta: string, seccion: SeccionId, regla: ReglaIncidencias,
): Promise<IncidenciaMetricas[]> {
  const pool = await getPool();
  const req = pool.request().input("desde", sql.Date, desde).input("hasta", sql.Date, hasta);
  const r = await req.query<FilaRps>(`
    SELECT DISTINCT ${columnas}, CONVERT(date, imp.ImputationDate) AS fecha, ot.autor
    FROM dbo.CPRImputationMO imp
    JOIN dbo.CPRMOTask task ON task.IDMOTask = imp.IDMOTask
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = task.IDManufacturingOrder AND mo.CodCompany = '001'
    JOIN dbo.CPRUnproductiveType unpr ON unpr.IDUnproductiveType = imp.IDUnproductiveType
    ${catalogo}
    ${autorRps}
    WHERE imp.CodCompany = '001' AND imp.Unproductive = 1
      AND ${regla.tipos}
      ${regla.soloConTareaPropia ? `AND EXISTS (SELECT 1 FROM dbo.CPRMOTask t2
        JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = t2.IDMOTask
        WHERE t2.IDManufacturingOrder = mo.IDManufacturingOrder
          AND rm.CodMOResourceMachine IN (${recursosDeTrabajoSql(SECCIONES[seccion])}))` : ""}
      AND imp.ImputationDate >= @desde AND imp.ImputationDate < DATEADD(day, 1, @hasta)
  `);
  return r.recordset.map(deFila);
}

const pasesGuardados = cacheConDisco<PaseRps[]>("metricas-pases-rps", SEIS_HORAS);

/** Las OF que OT cerró en RPS antes de que todo pasara por Coordina (ver
 *  COORDINA_EN_USO): la base del % de incidencias para esos meses, para las
 *  que Coordina no conoce. Cerrada = la última de sus tareas de OT
 *  terminada en OLANET o con fin real en RPS, como en el Historial. Son meses
 *  que ya no cambian, así que se guardan unas horas, y también en disco: la
 *  primera vez tras arrancar no se esperan (ver cache-disco.ts). */
export async function leerPasesRps(periodo: Periodo, seccion: SeccionId, opciones?: OpcionesRps): Promise<PaseRps[]> {
  if (process.env.DATASOURCE !== "rps" || seccion !== "ot") return [];
  const hasta = periodo.hasta && periodo.hasta < COORDINA_EN_USO ? periodo.hasta : sumarDias(COORDINA_EN_USO, -1);
  if (periodo.desde > hasta) return [];
  const clave = `${periodo.desde}|${hasta}`;
  return pasesGuardados(clave, () => consultarPases(periodo.desde, hasta), {
    clave,
    maxEdadMs: 24 * 3_600_000,
    ...opciones,
  });
}

async function consultarPases(desde: string, hasta: string): Promise<PaseRps[]> {
  const pool = await getPool();
  const req = pool.request().input("desde", sql.Date, desde).input("hasta", sql.Date, hasta);
  const r = await req.query<FilaRps>(`
    WITH Recursos AS (
      SELECT DISTINCT IDMOTask FROM dbo.CPRMOResourceMachine
      WHERE CodMOResourceMachine IN (${recursosSql(SECCIONES.ot)})
    ), FinFase AS (
      SELECT orden, fase, MAX(fecha_cambio) AS fin
      FROM dbo.tgm_estadosof_olanet WHERE idestadoof = 3 GROUP BY orden, fase
    ), Cierres AS (
      SELECT t.IDManufacturingOrder, MAX(COALESCE(e.fin, CASE WHEN t.RealEndDate > '2000-01-01' THEN t.RealEndDate END)) AS fin
      FROM dbo.CPRMOTask t
      JOIN Recursos r ON r.IDMOTask = t.IDMOTask
      JOIN dbo.CPRManufacturingOrder m ON m.IDManufacturingOrder = t.IDManufacturingOrder AND m.CodCompany = '001'
      LEFT JOIN FinFase e ON e.orden = m.CodManufacturingOrder AND e.fase = t.CodMOTask
      WHERE COALESCE(t.Description, '') NOT LIKE 'PLANTEAR EN TALLER%'
      GROUP BY t.IDManufacturingOrder
    ), Autores AS (
      -- Lo mismo que \`autorRps\`, de una pasada: con el OUTER APPLY la vista
      -- TGM_FICHAJES_OT (4 s entera) se leía por cada una de las ~2.500 OF y
      -- la consulta pasó de 4 s a 5 min (25/11/2026). Así, 10 s.
      SELECT f.IDManufacturingOrder, e.CodEmployee AS autor,
             ROW_NUMBER() OVER (PARTITION BY f.IDManufacturingOrder ORDER BY f.tiempoTotal DESC, f.operario) AS n
      FROM dbo.TGM_FICHAJES_OT f
      JOIN dbo.GENEmployee e ON e.CodCompany = '001' AND e.Description = f.operario
      WHERE f.IDManufacturingOrder IN (
        SELECT c.IDManufacturingOrder FROM Cierres c WHERE c.fin >= @desde AND c.fin < DATEADD(day, 1, @hasta))
    )
    SELECT ${columnas}, CONVERT(date, c.fin) AS fecha, ot.autor
    FROM Cierres c
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = c.IDManufacturingOrder
    ${catalogo}
    LEFT JOIN Autores ot ON ot.IDManufacturingOrder = mo.IDManufacturingOrder AND ot.n = 1
    WHERE c.fin >= @desde AND c.fin < DATEADD(day, 1, @hasta)
  `);
  return r.recordset.map(deFila);
}
