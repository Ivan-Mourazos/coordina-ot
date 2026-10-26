import sql from "mssql";
import { getPool } from "./db";
import { partirCausa, quienesEn, type CausaNc, type DefectoNc, type NoConformidad } from "../no-conformidad";
import { catalogo, columnas, familiaDe, type FilaFamilia } from "./metricas-fuentes";
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

const deFila = (f: Fila, d: Detalle | undefined, tareasDe: SeccionId[], familias: NoConformidad["familias"]): NoConformidad => ({
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
  causas: d?.causas ?? [],
  defectos: d?.defectos ?? [],
  tareasDe,
  familias,
});

interface Detalle { causas: CausaNc[]; defectos: DefectoNc[] }

/** Los defectos y las causas de unas NC, por id de NC. En trozos, por el
 *  tope de parámetros de SQL Server. */
async function detalleDe(ids: readonly string[]): Promise<Map<string, Detalle>> {
  const porNc = new Map<string, Detalle>();
  if (!ids.length) return porNc;
  const pool = await getPool();
  const de = (nc: string) => {
    let d = porNc.get(nc.toLowerCase());
    if (!d) { d = { causas: [], defectos: [] }; porNc.set(nc.toLowerCase(), d); }
    return d;
  };
  for (let i = 0; i < ids.length; i += 500) {
    const trozo = ids.slice(i, i + 500);
    const conIds = () => {
      const req = pool.request();
      const marcas = trozo.map((id, j) => { req.input(`n${j}`, sql.UniqueIdentifier, id); return `@n${j}`; });
      return { req, enIds: marcas.join(",") };
    };
    const def = conIds();
    const defectos = await def.req.query<{ nc: string; numero: number; tipo: string | null; descripcion: string | null }>(`
      SELECT CONVERT(varchar(36), d.IDNonConformity) AS nc, d.DefectNumber AS numero, gd.Description AS tipo,
             CONVERT(nvarchar(2000), d.Description) AS descripcion
        FROM dbo.APQNCDefect d
        LEFT JOIN dbo.APQNCGenericDefect gd ON gd.IDNCGenericDefect = d.IDNCGenericDefect
       WHERE d.IDNonConformity IN (${def.enIds})
       ORDER BY d.DefectNumber`);
    for (const f of defectos.recordset) {
      de(f.nc).defectos.push({ numero: f.numero, tipo: f.tipo?.trim() || null, descripcion: (f.descripcion ?? "").trim() });
    }
    const cau = conIds();
    const causas = await cau.req.query<{ nc: string; tipo: string | null; texto: string | null; contribucion: number | null; defecto: number }>(`
      SELECT CONVERT(varchar(36), d.IDNonConformity) AS nc, gc.Description AS tipo,
             CONVERT(nvarchar(2000), ca.Description) AS texto, ca.Contribution AS contribucion, d.DefectNumber AS defecto
        FROM dbo.APQNCCause ca
        JOIN dbo.APQNCDefect d ON d.IDNCDefect = ca.IDNCDefect
        LEFT JOIN dbo.APQNCGenericCause gc ON gc.IDNCGenericCause = ca.IDNCGenericCause
       WHERE d.IDNonConformity IN (${cau.enIds})
       ORDER BY d.DefectNumber, ca.CauseNumber`);
    for (const f of causas.recordset) {
      const { responsable, texto } = partirCausa(f.texto ?? "");
      de(f.nc).causas.push({ tipo: f.tipo?.trim() || null, responsable, quien: quienesEn(responsable), contribucion: f.contribucion, defecto: f.defecto, texto });
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
  const detalle = await detalleDe(r.recordset.map((f) => f.id));
  return r.recordset.map((f) => deFila(f, detalle.get(f.id.toLowerCase()), [], []));
}

const ncGuardadas = new Map<string, { hasta: number; filas: Promise<NoConformidad[]> }>();

/** Todas las NC de la empresa en el periodo, con sus defectos y causas, las
 *  secciones que tienen tareas en el pedido que falló y las familias de sus
 *  OF. Unas decenas al mes: el reparto se hace después, en `deLaSeccion`,
 *  `totalesNc`, `rectificadosPorFamilia` y `rectificadosPorMes`.
 *
 *  Se guarda 10 minutos por periodo: las gráficas piden el año entero aunque
 *  se mire un mes, y el año son unos 6 s contra RPS (medido el 26/10/2026).
 *  Calidad no abre NC cada minuto, y diez de retraso no cambian nada. */
export async function leerNcPeriodo(periodo: Periodo): Promise<NoConformidad[] | null> {
  if (process.env.DATASOURCE !== "rps") return null;
  const clave = `${periodo.desde}|${periodo.hasta}`;
  const guardada = ncGuardadas.get(clave);
  if (guardada && guardada.hasta > Date.now()) return guardada.filas;
  const filas = consultarNcPeriodo(periodo);
  ncGuardadas.set(clave, { hasta: Date.now() + 10 * 60_000, filas });
  filas.catch(() => ncGuardadas.delete(clave));
  return filas;
}

async function consultarNcPeriodo(periodo: Periodo): Promise<NoConformidad[]> {
  const pool = await getPool();
  const secciones = Object.keys(SECCIONES) as SeccionId[];
  const periodoEn = () => pool.request().input("desde", sql.Date, periodo.desde).input("hasta", sql.Date, periodo.hasta);
  const enPeriodo = `n.CodCompany = '001' AND n.DoneDate >= @desde AND n.DoneDate < DATEADD(day, 1, @hasta)`;
  const r = await periodoEn().query<Fila & Record<string, unknown>>(`
    ${SELECT_NC},
           ${secciones.map((s) => `CASE WHEN EXISTS (${tareasDeSeccionEnPedido(s)}) THEN 1 ELSE 0 END AS [en_${s}]`).join(",\n           ")}
    ${FROM_NC}
    WHERE ${enPeriodo}
    ORDER BY n.DoneDate DESC`);
  // Las OF del pedido que falló, con su familia (la misma regla que el resto
  // de Métricas) y qué secciones tienen tareas en cada una.
  const ofs = await periodoEn().query<FilaFamilia & { nc: string } & Record<string, unknown>>(`
    SELECT DISTINCT CONVERT(varchar(36), n.IDNonConformity) AS nc, ${columnas},
           ${secciones.map((s) => `CASE WHEN EXISTS (SELECT 1 FROM dbo.CPRMOTask t
              JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = t.IDMOTask
             WHERE t.IDManufacturingOrder = mo.IDManufacturingOrder
               AND rm.CodMOResourceMachine IN (${recursosDeTrabajoSql(SECCIONES[s])})) THEN 1 ELSE 0 END AS [en_${s}]`).join(",\n           ")}
      FROM dbo.APQNonConformity n
      JOIN dbo.FACOrderSL ped ON ped.CodOrder = n.CodOrder AND ped.CodCompany = '001'
      JOIN dbo.FACOrderLineSL lin ON lin.IDOrder = ped.IDOrder
      JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = lin.IDManufacturingOrder
      ${catalogo}
     WHERE ${enPeriodo}`);
  const familias = new Map<string, NoConformidad["familias"]>();
  for (const f of ofs.recordset) {
    const lista = familias.get(f.nc.toLowerCase()) ?? [];
    lista.push({ familia: familiaDe(f), secciones: secciones.filter((s) => f[`en_${s}`] === 1) });
    familias.set(f.nc.toLowerCase(), lista);
  }
  const detalle = await detalleDe(r.recordset.map((f) => f.id));
  return r.recordset.map((f) => deFila(
    f,
    detalle.get(f.id.toLowerCase()),
    secciones.filter((s) => f[`en_${s}`] === 1),
    familias.get(f.id.toLowerCase()) ?? [],
  ));
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
