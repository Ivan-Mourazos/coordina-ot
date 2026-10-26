import sql from "mssql";
import { getPool } from "./db";
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

export async function leerFamiliasMetricas(movs: readonly MovimientoRegistrado[]): Promise<Map<string, string>> {
  const porId = new Map<string, string>();
  if (process.env.DATASOURCE !== "rps") {
    for (const p of PEDIDOS) for (const of of p.ofs) porId.set(of.id, of.familia);
    return porId;
  }
  const ids = new Map(movs.map((m) => [m.ofId, partirOfId(m.ofId)?.of]).filter((e): e is [string, string] => !!e[1]));
  const ordenes = [...new Set(ids.values())];
  if (!ordenes.length) return porId;
  const pool = await getPool();
  const porOrden = new Map<string, string>();
  // Por debajo del límite de parámetros de SQL Server, incluso con «Todo».
  for (let i = 0; i < ordenes.length; i += 500) {
    const req = pool.request();
    const marcas = ordenes.slice(i, i + 500).map((orden, j) => { req.input(`of${j}`, sql.VarChar(50), orden); return `@of${j}`; });
    const r = await req.query<FilaFamilia>(`SELECT ${columnas}
      FROM dbo.CPRManufacturingOrder mo ${catalogo}
      WHERE mo.CodCompany = '001' AND mo.CodManufacturingOrder IN (${marcas.join(",")})`);
    for (const f of r.recordset) porOrden.set(f.orden.trim(), familiaDe(f));
  }
  for (const [id, orden] of ids) { const familia = porOrden.get(orden); if (familia) porId.set(id, familia); }
  return porId;
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
const INCIDENCIAS: Partial<Record<SeccionId, { tipos: string; desde?: string; soloConTareaPropia?: boolean }>> = {
  ot: { tipos: "unpr.Description LIKE '%ERROR EN PLANTEAMIENTO%'" },
  diseno: {
    tipos: `unpr.Description IN ('ROTULACION-OTROS ERRORES ROTULACION', 'ROTULACION-ERROR AL DOCUMENTAR PEDIDO',
      'ROTULACION-ERROR EN CORTE DE MASCARA O VINILO', 'IMPRESION DIGITAL-ERROR EN ARCHIVO')`,
    desde: "2026-09-08",
    soloConTareaPropia: true,
  },
};

/** Las incidencias de la sección (ver `INCIDENCIAS`). De TODO el equipo: a
 *  quién toca cada una lo decide `calcularDetalleMetricas`, que sabe quién la
 *  entregó en Coordina. Una fila por OF y día, aunque haya varios apuntes. */
export async function leerIncidenciasMetricas(periodo: Periodo, seccion: SeccionId): Promise<IncidenciaMetricas[] | null> {
  const regla = INCIDENCIAS[seccion];
  if (process.env.DATASOURCE !== "rps" || !regla) return null;
  const desde = regla.desde && regla.desde > periodo.desde ? regla.desde : periodo.desde;
  if (periodo.hasta && desde > periodo.hasta) return [];
  const pool = await getPool();
  const req = pool.request().input("desde", sql.Date, desde).input("hasta", sql.Date, periodo.hasta);
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

const pasesGuardados = new Map<string, { hasta: number; filas: Promise<PaseRps[]> }>();

/** Las OF que OT cerró en RPS antes de que todo pasara por Coordina (ver
 *  COORDINA_EN_USO): la base del % de incidencias para esos meses, para las
 *  que Coordina no conoce. Cerrada = la última de sus tareas de OT
 *  terminada en OLANET o con fin real en RPS, como en el Historial. Son meses
 *  que ya no cambian, así que se guardan unas horas. */
export async function leerPasesRps(periodo: Periodo, seccion: SeccionId): Promise<PaseRps[]> {
  if (process.env.DATASOURCE !== "rps" || seccion !== "ot") return [];
  const hasta = periodo.hasta && periodo.hasta < COORDINA_EN_USO ? periodo.hasta : sumarDias(COORDINA_EN_USO, -1);
  if (periodo.desde > hasta) return [];
  const clave = `${periodo.desde}|${hasta}`;
  const guardado = pasesGuardados.get(clave);
  if (guardado && guardado.hasta > Date.now()) return guardado.filas;
  const filas = consultarPases(periodo.desde, hasta);
  pasesGuardados.set(clave, { hasta: Date.now() + 6 * 3_600_000, filas });
  filas.catch(() => pasesGuardados.delete(clave));
  return filas;
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
    )
    SELECT ${columnas}, CONVERT(date, c.fin) AS fecha, ot.autor
    FROM Cierres c
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = c.IDManufacturingOrder
    ${catalogo}
    ${autorRps}
    WHERE c.fin >= @desde AND c.fin < DATEADD(day, 1, @hasta)
  `);
  return r.recordset.map(deFila);
}
