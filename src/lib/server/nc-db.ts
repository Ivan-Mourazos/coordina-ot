import sql from "mssql";
import { getPool } from "./db";
import { PROCESO_DISENO, type NoConformidad } from "../no-conformidad";
import { SECCIONES, recursosDeTrabajoSql, type SeccionId } from "../secciones";
import type { Periodo } from "../metricas";

// ─── Las no conformidades de RPS (ver lib/no-conformidad.ts) ─────────────────
// APQNonConformity es la NC; su tabla custom trae los dos procesos afectados y
// el pedido rectificativo. Los procesos son ids de `_Proceso` ("001-03" =
// DISEÑO). Solo lectura.

interface Fila {
  codigo: string;
  fecha: Date | null;
  pedido: string | null;
  rectificativo: string | null;
  proceso1: string | null;
  proceso2: string | null;
  origen: string | null;
  descripcion: string | null;
  comentarios: string | null;
  cerrada: number;
}

const SELECT_NC = `
  SELECT n.CodNonConformity AS codigo, n.DoneDate AS fecha, n.CodOrder AS pedido,
         c.CodPedidoRectificado AS rectificativo, p1.Descripcion AS proceso1, p2.Descripcion AS proceso2,
         src.Description AS origen, CONVERT(nvarchar(1000), n.Description) AS descripcion,
         CONVERT(nvarchar(2000), n.Comments) AS comentarios,
         CASE WHEN n.ClosedDate IS NULL THEN 0 ELSE 1 END AS cerrada
    FROM dbo.APQNonConformity n
    LEFT JOIN dbo._APQNonConformity_Custom c ON c.IDNonConformity = n.IDNonConformity
    LEFT JOIN dbo._Proceso p1 ON p1.IDProceso = c.IDProcesoAfectado1
    LEFT JOIN dbo._Proceso p2 ON p2.IDProceso = c.IDProcesoAfectado2
    LEFT JOIN dbo.APQNCSource src ON src.IDNCSource = n.IDNCSource`;

const deFila = (f: Fila): NoConformidad => ({
  codigo: f.codigo.trim(),
  fecha: f.fecha ? f.fecha.toISOString().slice(0, 10) : "",
  pedido: f.pedido?.trim() || null,
  rectificativo: f.rectificativo?.trim() || null,
  procesos: [...new Set([f.proceso1, f.proceso2].map((p) => p?.trim()).filter((p): p is string => !!p))],
  origen: f.origen?.trim() || null,
  descripcion: (f.descripcion ?? "").trim(),
  comentarios: (f.comentarios ?? "").trim(),
  cerrada: f.cerrada === 1,
});

/** Las NC de un pedido: las que se abrieron por él y las que él rectifica.
 *  Una ficha las enseña las dos, porque las dos cuentan su historia: «este
 *  falló y se arregló con tal» y «este es el arreglo de tal». */
export async function ncDePedido(pedido: string): Promise<NoConformidad[]> {
  if (process.env.DATASOURCE !== "rps") return [];
  const pool = await getPool();
  // Tipado VarChar: sin él viaja como nvarchar y SQL Server tira el índice.
  const r = await pool.request().input("pedido", sql.VarChar(25), pedido).query<Fila>(`
    ${SELECT_NC}
    WHERE n.CodCompany = '001' AND (n.CodOrder = @pedido OR c.CodPedidoRectificado = @pedido)
    ORDER BY n.DoneDate DESC`);
  return r.recordset.map(deFila);
}

/** Cuántas NC abrió Calidad en el periodo en TODA la empresa, y cuántas con
 *  pedido rectificativo. Es la referencia junto a las de la sección: un % de
 *  «rectificados nuestros» no se puede dar, porque de quién fue lo decide
 *  Calidad a mano y muchas están sin clasificar (Iván, 26/10/2026). */
export async function leerTotalesNc(periodo: Periodo): Promise<{ total: number; rectificadas: number } | null> {
  if (process.env.DATASOURCE !== "rps") return null;
  const pool = await getPool();
  const r = await pool.request()
    .input("desde", sql.Date, periodo.desde)
    .input("hasta", sql.Date, periodo.hasta)
    .query<{ total: number; rectificadas: number }>(`
    SELECT COUNT(*) AS total, SUM(CASE WHEN c.CodPedidoRectificado IS NOT NULL THEN 1 ELSE 0 END) AS rectificadas
      FROM dbo.APQNonConformity n
      LEFT JOIN dbo._APQNonConformity_Custom c ON c.IDNonConformity = n.IDNonConformity
     WHERE n.CodCompany = '001' AND n.DoneDate >= @desde AND n.DoneDate < DATEADD(day, 1, @hasta)`);
  const f = r.recordset[0];
  return { total: f?.total ?? 0, rectificadas: f?.rectificadas ?? 0 };
}

/** Las NC de una sección en el periodo: en un pedido con tareas de esa
 *  sección, y apuntadas al proceso DISEÑO o todavía sin ningún proceso (ver
 *  `sinClasificar`: Calidad aún no ha dicho de quién fue, y sin ellas casi no
 *  salía ninguna de las recientes). Solo OT y Diseño Gráfico: Impresión no
 *  tiene proceso propio en las NC. */
export async function leerNcMetricas(periodo: Periodo, seccion: SeccionId): Promise<NoConformidad[] | null> {
  if (process.env.DATASOURCE !== "rps" || seccion === "impresion") return null;
  const pool = await getPool();
  const r = await pool.request()
    .input("desde", sql.Date, periodo.desde)
    .input("hasta", sql.Date, periodo.hasta)
    .input("proceso", sql.VarChar(50), PROCESO_DISENO)
    .query<Fila>(`
    ${SELECT_NC}
    WHERE n.CodCompany = '001' AND n.DoneDate >= @desde AND n.DoneDate < DATEADD(day, 1, @hasta)
      AND (@proceso IN (p1.Descripcion, p2.Descripcion)
        OR (c.IDProcesoAfectado1 IS NULL AND c.IDProcesoAfectado2 IS NULL))
      AND EXISTS (
        SELECT 1 FROM dbo.FACOrderSL o
          JOIN dbo.FACOrderLineSL l ON l.IDOrder = o.IDOrder
          JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = l.IDManufacturingOrder
          JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = t.IDMOTask
         WHERE o.CodCompany = '001' AND o.CodOrder = n.CodOrder
           AND rm.CodMOResourceMachine IN (${recursosDeTrabajoSql(SECCIONES[seccion])}))
    ORDER BY n.DoneDate DESC`);
  return r.recordset.map(deFila);
}
