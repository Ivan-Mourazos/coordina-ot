import sql from "mssql";
import { getPool } from "./db";
import { PROCESO_DISENO, papelDiseno, type NoConformidad, type TotalesNc } from "../no-conformidad";
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
  proceso1: f.proceso1?.trim() || null,
  proceso2: f.proceso2?.trim() || null,
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

/** Ver `TotalesNc`. */
export async function leerTotalesNc(periodo: Periodo): Promise<TotalesNc | null> {
  if (process.env.DATASOURCE !== "rps") return null;
  const pool = await getPool();
  const secciones = Object.keys(SECCIONES) as SeccionId[];
  // Una fila por NC con su papel de DISEÑO y de qué secciones tiene tareas el
  // pedido que falló; se suma aquí abajo. Son unas decenas al mes.
  const r = await pool.request()
    .input("desde", sql.Date, periodo.desde)
    .input("hasta", sql.Date, periodo.hasta)
    .query<{ rect: number; proceso1: string | null; proceso2: string | null } & Record<string, number | string | null>>(`
    SELECT CASE WHEN c.CodPedidoRectificado IS NOT NULL THEN 1 ELSE 0 END AS rect,
           p1.Descripcion AS proceso1, p2.Descripcion AS proceso2,
           ${secciones.map((s) => `CASE WHEN EXISTS (${tareasDeSeccionEnPedido(s)}) THEN 1 ELSE 0 END AS [en_${s}]`).join(",\n           ")}
      FROM dbo.APQNonConformity n
      LEFT JOIN dbo._APQNonConformity_Custom c ON c.IDNonConformity = n.IDNonConformity
      LEFT JOIN dbo._Proceso p1 ON p1.IDProceso = c.IDProcesoAfectado1
      LEFT JOIN dbo._Proceso p2 ON p2.IDProceso = c.IDProcesoAfectado2
     WHERE n.CodCompany = '001' AND n.DoneDate >= @desde AND n.DoneDate < DATEADD(day, 1, @hasta)`);

  const vacio = () => ({ principal: 0, secundario: 0, rectificadas: 0 });
  const t: TotalesNc = {
    total: 0, rectificadas: 0, disenoPrincipal: 0, disenoPrincipalRectificadas: 0,
    disenoSecundario: 0, disenoSecundarioRectificadas: 0, sinClasificar: 0,
    porSeccion: { ot: vacio(), diseno: vacio(), impresion: vacio(), ninguna: vacio() },
  };
  for (const f of r.recordset) {
    const rect = f.rect === 1 ? 1 : 0;
    t.total++;
    t.rectificadas += rect;
    const papel = papelDiseno({ proceso1: f.proceso1?.trim() || null, proceso2: f.proceso2?.trim() || null });
    if (papel === "sinClasificar") t.sinClasificar++;
    if (papel !== "principal" && papel !== "secundario") continue;
    if (papel === "principal") { t.disenoPrincipal++; t.disenoPrincipalRectificadas += rect; }
    else { t.disenoSecundario++; t.disenoSecundarioRectificadas += rect; }
    // De quién, por nombre: la sección cuyas tareas lleva el pedido. Con
    // tareas de varias, cuenta en cada una; sin ninguna, en «ninguna».
    const suyas = secciones.filter((s) => f[`en_${s}`] === 1);
    for (const s of suyas.length ? suyas : (["ninguna"] as const)) {
      const fila = t.porSeccion[s];
      fila[papel]++;
      fila.rectificadas += rect;
    }
  }
  return t;
}

/** ¿Tiene el pedido de la NC (`n.CodOrder`) tareas de la sección? Es lo que
 *  decide de quién es una NC de DISEÑO: RPS no separa OT, Diseño e Impresión. */
function tareasDeSeccionEnPedido(seccion: SeccionId): string {
  return `SELECT 1 FROM dbo.FACOrderSL o
      JOIN dbo.FACOrderLineSL l ON l.IDOrder = o.IDOrder
      JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = l.IDManufacturingOrder
      JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = t.IDMOTask
     WHERE o.CodCompany = '001' AND o.CodOrder = n.CodOrder
       AND rm.CodMOResourceMachine IN (${recursosDeTrabajoSql(SECCIONES[seccion])})`;
}

/** Las NC de una sección en el periodo: en un pedido con tareas de esa
 *  sección, y apuntadas al proceso DISEÑO o todavía sin ningún proceso (ver
 *  `sinClasificar`: Calidad aún no ha dicho de quién fue, y sin ellas casi no
 *  salía ninguna de las recientes). Las tres secciones: ninguna tiene proceso
 *  propio en RPS, todas caen en DISEÑO (Iván, 26/10/2026). */
export async function leerNcMetricas(periodo: Periodo, seccion: SeccionId): Promise<NoConformidad[] | null> {
  if (process.env.DATASOURCE !== "rps") return null;
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
      AND EXISTS (${tareasDeSeccionEnPedido(seccion)})
    ORDER BY n.DoneDate DESC`);
  return r.recordset.map(deFila);
}
