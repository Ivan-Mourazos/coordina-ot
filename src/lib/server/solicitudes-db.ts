import sql from "mssql";
import { getPool } from "./db";
import {
  ROL_RPS,
  WORKFLOW_SOLICITUDES,
  componerSolicitudes,
  type FilaCampo,
  type FilaTarea,
  type Solicitud,
} from "../solicitudes";
import type { SeccionId } from "../secciones";

// ─── Solicitudes de comerciales: lectura de RPS ──────────────────────────────
// Solo lectura. La lógica y qué es cada cosa, en lib/solicitudes.ts. Cuando
// llegue la vista que prepara David, se cambia esto y nada más.

const DIAS = 180;
const CACHE_MS = 60_000;

const ROLES = Object.values(ROL_RPS).map((r) => `'${r}'`).join(",");

/** Las ejecuciones que pasaron por OT o Diseño. El rol se toma de la tarea de
 *  coger, que es la única asignada a un rol y no a una persona. */
const EJECUCIONES = `
  WITH ejecucion AS (
    SELECT DISTINCT t.WorkflowInstanceID AS instancia, a.CodRole AS rol
      FROM dbo.BPMTask t WITH (NOLOCK)
      JOIN dbo.BPMWorkflow w ON w.IDWorkflow = t.IDWorkflow
      JOIN dbo.BPMTaskAssignation a ON a.IDTask = t.IDTask
     WHERE w.Description = @workflow
       AND t.CodCompany = '001'
       AND t.Description LIKE 'Formulario asignar trabajo%'
       AND t.CreationDate >= DATEADD(day, -${DIAS}, GETDATE())
       AND a.CodRole IN (${ROLES})
  )`;

type Datos = { tareas: FilaTarea[]; campos: FilaCampo[] };
let guardado: { hasta: number; datos: Promise<Datos> } | null = null;

async function consultar(): Promise<Datos> {
  const pool = await getPool();
  const peticion = () => pool.request().input("workflow", sql.NVarChar(100), WORKFLOW_SOLICITUDES);
  const tareas = await peticion().query<Omit<FilaTarea, "creada" | "cerrada"> & { creada: Date; cerrada: Date | null }>(`
    ${EJECUCIONES}
    SELECT CONVERT(varchar(36), t.IDTask) AS tarea, CONVERT(varchar(36), t.WorkflowInstanceID) AS instancia, e.rol,
           CONVERT(nvarchar(1000), tr.Label) AS etiqueta, tr.State AS estadoEjecucion, t.Description AS descripcion,
           t.AssignedUser AS usuario, t.RowCreatedBy AS creadaPor, t.CompletedBy AS cerradaPor,
           t.CreationTimestamp AS creada, t.EndDate AS cerrada
      FROM ejecucion e
      JOIN dbo.BPMTask t WITH (NOLOCK) ON t.WorkflowInstanceID = e.instancia
      LEFT JOIN dbo.BPMWorkflowTracking tr ON tr.WorkflowInstanceID = e.instancia`);
  const campos = await peticion().query<FilaCampo>(`
    ${EJECUCIONES}
    SELECT CONVERT(varchar(36), d.IDTask) AS tarea, f.Caption AS campo,
           COALESCE(CONVERT(nvarchar(2000), f.TextValue), f.StringValue) AS valor
      FROM ejecucion e
      JOIN dbo.BPMTask t WITH (NOLOCK) ON t.WorkflowInstanceID = e.instancia
      JOIN dbo.BPMDataFormTask d ON d.IDTask = t.IDTask
      JOIN dbo.BPMDataFormField f ON f.IDDataFormTask = d.IDDataFormTask
     WHERE f.Caption IN ('Descripcion oportunidad', 'Comentario comercial', 'Comentarios',
                         'Adjunto 1 comercial', 'Adjunto 2 comercial')`);
  return {
    tareas: tareas.recordset.map((t) => ({
      ...t,
      creada: t.creada.toISOString(),
      cerrada: t.cerrada ? t.cerrada.toISOString() : null,
    })),
    campos: campos.recordset,
  };
}

/** Un minuto de caché: lo piden a la vez la pestaña y su contador, y coger una
 *  en RPS tiene que verse enseguida. */
function datos(): Promise<Datos> {
  if (guardado && guardado.hasta > Date.now()) return guardado.datos;
  const consulta = consultar();
  guardado = { hasta: Date.now() + CACHE_MS, datos: consulta };
  consulta.catch(() => {
    guardado = null;
  });
  return consulta;
}

export async function leerSolicitudes(seccion: SeccionId): Promise<Solicitud[]> {
  const rol = ROL_RPS[seccion];
  if (!rol || process.env.DATASOURCE !== "rps") return [];
  const { tareas, campos } = await datos();
  return componerSolicitudes(tareas, campos, rol);
}

/** La ruta de un adjunto, leída de la BD por tarea y número: el navegador nunca
 *  manda una ruta. Solo responde por tareas de este workflow. */
export async function rutaAdjunto(tarea: string, numero: 1 | 2): Promise<string | null> {
  if (process.env.DATASOURCE !== "rps") return null;
  const pool = await getPool();
  const r = await pool
    .request()
    .input("tarea", sql.UniqueIdentifier, tarea)
    .input("workflow", sql.NVarChar(100), WORKFLOW_SOLICITUDES)
    .input("campo", sql.NVarChar(60), `Adjunto ${numero} comercial`)
    .query<{ ruta: string | null }>(`
      SELECT TOP 1 f.StringValue AS ruta
        FROM dbo.BPMTask t WITH (NOLOCK)
        JOIN dbo.BPMWorkflow w ON w.IDWorkflow = t.IDWorkflow
        JOIN dbo.BPMDataFormTask d ON d.IDTask = t.IDTask
        JOIN dbo.BPMDataFormField f ON f.IDDataFormTask = d.IDDataFormTask
       WHERE t.IDTask = @tarea AND w.Description = @workflow AND f.Caption = @campo`);
  return r.recordset[0]?.ruta?.trim() || null;
}
