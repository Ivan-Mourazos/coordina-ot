import sql from "mssql";
import { getPool } from "./db";
import { familiaDeTexto } from "./rps";
import { codigoRpsDe } from "./operarios";
import { partirOfId } from "../bonos";
import { PEDIDOS } from "../mock";
import type { MovimientoRegistrado, Periodo } from "../metricas";
import type { IncidenciaMetricas } from "../metricas-personales";
import type { SeccionId } from "../secciones";

interface FilaFamilia { orden: string; descripcion: string | null; grupo: string | null; subfamilia: string | null; cliente: string | null }
const familiaDe = (f: FilaFamilia) => familiaDeTexto(f.descripcion, f.grupo, { subfamilia: f.subfamilia, cliente: f.cliente });
const catalogo = `
  LEFT JOIN dbo.STKArticle a ON a.IDArticle = mo.IDArticle
  LEFT JOIN dbo.GENProductFamily pf ON pf.IDProductFamily = a.IDProductFamily
  LEFT JOIN dbo.GENProductSubFamily sf ON sf.IDProductSubFamily = a.IDProductSubFamily
  OUTER APPLY (SELECT TOP 1 cli.Description AS cliente
    FROM dbo.FACOrderLineSL l
    JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany = '001'
    LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = o.IDCustomer
    WHERE l.IDManufacturingOrder = mo.IDManufacturingOrder
    ORDER BY o.CodOrder) venta`;
const columnas = `mo.CodManufacturingOrder AS orden, mo.Description AS descripcion,
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

/** Misma fuente y atribución que el Excel facilitado por OT: el autor es
 * quien más tiempo tiene en TGM_FICHAJES_OT. TODOS los tipos de incidencia de
 * las OF que planteaste, no solo los errores de planteamiento o documentación
 * (Iván, 21/10/2026): un error de soldadura en tu OF también es tuyo de mirar.
 * Cada incidencia lleva su tipo para poder separarlas. */
export async function leerIncidenciasMetricas(periodo: Periodo, miId: string, seccion: SeccionId): Promise<IncidenciaMetricas[] | null> {
  if (process.env.DATASOURCE !== "rps" || seccion !== "ot") return null;
  const empleado = codigoRpsDe(miId);
  if (!empleado) return null;
  const pool = await getPool();
  const req = pool.request().input("empleado", sql.VarChar(20), empleado)
    .input("desde", sql.Date, periodo.desde).input("hasta", sql.Date, periodo.hasta);
  const r = await req.query<FilaFamilia & { fecha: Date; tipo: string | null }>(`
    SELECT DISTINCT ${columnas}, CONVERT(date, imp.ImputationDate) AS fecha,
      LTRIM(RTRIM(SUBSTRING(unpr.Description, CHARINDEX('-', unpr.Description) + 1, 1000))) AS tipo
    FROM dbo.CPRImputationMO imp
    JOIN dbo.CPRMOTask task ON task.IDMOTask = imp.IDMOTask
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = task.IDManufacturingOrder AND mo.CodCompany = '001'
    JOIN dbo.CPRUnproductiveType unpr ON unpr.IDUnproductiveType = imp.IDUnproductiveType
    ${catalogo}
    OUTER APPLY (SELECT TOP 1 operario FROM dbo.TGM_FICHAJES_OT
      WHERE IDManufacturingOrder = mo.IDManufacturingOrder
      ORDER BY tiempoTotal DESC, operario) ot
    WHERE imp.CodCompany = '001' AND imp.Unproductive = 1
      AND imp.ImputationDate >= @desde AND imp.ImputationDate < DATEADD(day, 1, @hasta)
      AND ot.operario = (SELECT Description FROM dbo.GENEmployee WHERE CodCompany = '001' AND CodEmployee = @empleado)
  `);
  return r.recordset.map((f) => ({ fecha: f.fecha.toISOString().slice(0, 10), orden: f.orden.trim(), familia: familiaDe(f), tipo: f.tipo?.trim() || undefined }));
}
