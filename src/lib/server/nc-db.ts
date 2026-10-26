import sql from "mssql";
import { getPool } from "./db";
import { partirCausa, quienesEn, type CausaNc, type NoConformidad } from "../no-conformidad";
import { SECCIONES, recursosDeTrabajoSql, type SeccionId } from "../secciones";
import type { Periodo } from "../metricas";

// ─── Las no conformidades de RPS (ver lib/no-conformidad.ts) ─────────────────
// APQNonConformity es la NC; su tabla custom trae los dos procesos afectados y
// el pedido rectificativo (los procesos son ids de `_Proceso`, "001-03" =
// DISEÑO). Las causas cuelgan de los defectos: APQNCDefect → APQNCCause, con
// su tipo en APQNCGenericCause. Solo lectura.
//
// Aquí solo se LEE. Qué NC es de qué sección y las cuentas son funciones
// puras de lib/no-conformidad.ts, con sus tests.

interface Fila {
  id: string;
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
  SELECT CONVERT(varchar(36), n.IDNonConformity) AS id, n.CodNonConformity AS codigo, n.DoneDate AS fecha,
         n.CodOrder AS pedido, c.CodPedidoRectificado AS rectificativo,
         p1.Descripcion AS proceso1, p2.Descripcion AS proceso2,
         src.Description AS origen, CONVERT(nvarchar(1000), n.Description) AS descripcion,
         CONVERT(nvarchar(2000), n.Comments) AS comentarios,
         CASE WHEN n.ClosedDate IS NULL THEN 0 ELSE 1 END AS cerrada`;
const FROM_NC = `
    FROM dbo.APQNonConformity n
    LEFT JOIN dbo._APQNonConformity_Custom c ON c.IDNonConformity = n.IDNonConformity
    LEFT JOIN dbo._Proceso p1 ON p1.IDProceso = c.IDProcesoAfectado1
    LEFT JOIN dbo._Proceso p2 ON p2.IDProceso = c.IDProcesoAfectado2
    LEFT JOIN dbo.APQNCSource src ON src.IDNCSource = n.IDNCSource`;

const deFila = (f: Fila, causas: CausaNc[], tareasDe: SeccionId[]): NoConformidad => ({
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
  causas,
  tareasDe,
});

/** Las causas de unas NC, por id de NC. En trozos, por el tope de
 *  parámetros de SQL Server. */
async function causasDe(ids: readonly string[]): Promise<Map<string, CausaNc[]>> {
  const porNc = new Map<string, CausaNc[]>();
  if (!ids.length) return porNc;
  const pool = await getPool();
  for (let i = 0; i < ids.length; i += 500) {
    const req = pool.request();
    const marcas = ids.slice(i, i + 500).map((id, j) => { req.input(`n${j}`, sql.UniqueIdentifier, id); return `@n${j}`; });
    const r = await req.query<{ nc: string; tipo: string | null; texto: string | null; contribucion: number | null; defecto: number }>(`
      SELECT CONVERT(varchar(36), d.IDNonConformity) AS nc, gc.Description AS tipo,
             CONVERT(nvarchar(2000), ca.Description) AS texto, ca.Contribution AS contribucion, d.DefectNumber AS defecto
        FROM dbo.APQNCCause ca
        JOIN dbo.APQNCDefect d ON d.IDNCDefect = ca.IDNCDefect
        LEFT JOIN dbo.APQNCGenericCause gc ON gc.IDNCGenericCause = ca.IDNCGenericCause
       WHERE d.IDNonConformity IN (${marcas.join(",")})
       ORDER BY d.DefectNumber, ca.CauseNumber`);
    for (const f of r.recordset) {
      const { responsable, texto } = partirCausa(f.texto ?? "");
      const lista = porNc.get(f.nc.toLowerCase()) ?? [];
      lista.push({ tipo: f.tipo?.trim() || null, responsable, quien: quienesEn(responsable), contribucion: f.contribucion, defecto: f.defecto, texto });
      porNc.set(f.nc.toLowerCase(), lista);
    }
  }
  return porNc;
}

/** Las NC de un pedido: las que se abrieron por él y las que él rectifica.
 *  Una ficha las enseña las dos, porque las dos cuentan su historia: «este
 *  falló y se arregló con tal» y «este es el arreglo de tal». */
export async function ncDePedido(pedido: string): Promise<NoConformidad[]> {
  if (process.env.DATASOURCE !== "rps") return [];
  const pool = await getPool();
  // Tipado VarChar: sin él viaja como nvarchar y SQL Server tira el índice.
  const r = await pool.request().input("pedido", sql.VarChar(25), pedido).query<Fila>(`
    ${SELECT_NC} ${FROM_NC}
    WHERE n.CodCompany = '001' AND (n.CodOrder = @pedido OR c.CodPedidoRectificado = @pedido)
    ORDER BY n.DoneDate DESC`);
  const causas = await causasDe(r.recordset.map((f) => f.id));
  return r.recordset.map((f) => deFila(f, causas.get(f.id.toLowerCase()) ?? [], []));
}

/** Todas las NC de la empresa en el periodo, con sus causas y las secciones
 *  que tienen tareas en el pedido que falló. Unas decenas al mes: el reparto
 *  se hace después, en `deLaSeccion` y `totalesNc`. */
export async function leerNcPeriodo(periodo: Periodo): Promise<NoConformidad[] | null> {
  if (process.env.DATASOURCE !== "rps") return null;
  const pool = await getPool();
  const secciones = Object.keys(SECCIONES) as SeccionId[];
  const r = await pool.request()
    .input("desde", sql.Date, periodo.desde)
    .input("hasta", sql.Date, periodo.hasta)
    .query<Fila & Record<string, unknown>>(`
    ${SELECT_NC},
           ${secciones.map((s) => `CASE WHEN EXISTS (${tareasDeSeccionEnPedido(s)}) THEN 1 ELSE 0 END AS [en_${s}]`).join(",\n           ")}
    ${FROM_NC}
    WHERE n.CodCompany = '001' AND n.DoneDate >= @desde AND n.DoneDate < DATEADD(day, 1, @hasta)
    ORDER BY n.DoneDate DESC`);
  const causas = await causasDe(r.recordset.map((f) => f.id));
  return r.recordset.map((f) =>
    deFila(f, causas.get(f.id.toLowerCase()) ?? [], secciones.filter((s) => f[`en_${s}`] === 1)),
  );
}

/** ¿Tiene el pedido de la NC (`n.CodOrder`) tareas de la sección? Solo hace
 *  falta para las NC que Calidad aún no ha investigado (sin causas). */
function tareasDeSeccionEnPedido(seccion: SeccionId): string {
  return `SELECT 1 FROM dbo.FACOrderSL o
      JOIN dbo.FACOrderLineSL l ON l.IDOrder = o.IDOrder
      JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = l.IDManufacturingOrder
      JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = t.IDMOTask
     WHERE o.CodCompany = '001' AND o.CodOrder = n.CodOrder
       AND rm.CodMOResourceMachine IN (${recursosDeTrabajoSql(SECCIONES[seccion])})`;
}
