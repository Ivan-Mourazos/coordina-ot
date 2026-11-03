import sql from "mssql";
import { getPool } from "./db";
import { open } from "node:fs/promises";
import path from "node:path";
import { segmentosEnShare } from "../historial";
import {
  ROL_RPS,
  comoDocumentoRps,
  enriquecer,
  extensionPorContenido,
  type FilaVista,
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

// ─── La vista de David (TGM_WF_COORDINA, 03/11/2026) ─────────────────────────
// Trae lo que el workflow no guarda: la respuesta del técnico, cuándo la terminó
// y el documento que subió. Tarda unos segundos, y lo que trae cambia poco: diez
// minutos de caché. Si falla, la pestaña sigue igual, sin esos datos.

const CACHE_VISTA_MS = 10 * 60_000;
let vistaGuardada: { hasta: number; filas: Promise<FilaVista[]> } | null = null;

function vista(): Promise<FilaVista[]> {
  if (vistaGuardada && vistaGuardada.hasta > Date.now()) return vistaGuardada.filas;
  const filas = getPool()
    .then((pool) =>
      pool.request().query<{
        instancia: string;
        actividadComercial: string | null;
        actividadTecnico: string | null;
        tecnico: string | null;
        comentarioTecnico: string | null;
        fechaRealizacion: Date | null;
        documentoTecnico: string | null;
      }>(`
        SELECT WorkflowInstanceID AS instancia, ActividadComercial AS actividadComercial,
               ActividadTecnico AS actividadTecnico, Tecnico AS tecnico,
               ComentarioTecnico AS comentarioTecnico, FechaRealizacion AS fechaRealizacion,
               DocumentoSubidoTecnico AS documentoTecnico
          FROM dbo.TGM_WF_COORDINA`),
    )
    .then((r) =>
      r.recordset.map((f) => ({
        ...f,
        instancia: f.instancia.trim().toLowerCase(),
        fechaRealizacion: f.fechaRealizacion ? f.fechaRealizacion.toISOString() : null,
      })),
    );
  vistaGuardada = { hasta: Date.now() + CACHE_VISTA_MS, filas };
  filas.catch(() => {
    vistaGuardada = null;
  });
  return filas;
}

const RAIZ_DOCS =
  process.platform === "win32"
    ? (process.env.RPS_DOCS_DIR_WIN ?? "\\\\192.168.0.128\\RPS")
    : (process.env.RPS_DOCS_DIR ?? "/mnt/rps");

/** De una ruta de RPS a la del disco de este servidor, o null si no cuelga del
 *  share. Mismas defensas que los documentos del pedido. */
export function rutaLocal(guardada: string): string | null {
  const segmentos = segmentosEnShare(comoDocumentoRps(guardada));
  if (!segmentos) return null;
  const ruta = path.join(RAIZ_DOCS, ...segmentos);
  return path.resolve(ruta).startsWith(path.resolve(RAIZ_DOCS)) ? ruta : null;
}

/** El nombre con extensión de cada documento del técnico, por ruta. Para saberla
 *  hay que leer el principio del fichero: se hace una vez y se recuerda. */
const extensiones = new Map<string, string | null>();

async function nombreDocumento(guardada: string): Promise<string | null> {
  const nombre = path.win32.basename(guardada.trim());
  if (/\.[a-z0-9]{2,4}$/i.test(nombre)) return nombre;
  if (!extensiones.has(guardada)) {
    const ruta = rutaLocal(guardada);
    let ext: string | null = null;
    if (ruta) {
      try {
        const f = await open(ruta, "r");
        try {
          const { buffer, bytesRead } = await f.read(Buffer.alloc(8), 0, 8, 0);
          ext = extensionPorContenido(buffer.subarray(0, bytesRead));
        } finally {
          await f.close();
        }
      } catch {
        ext = null;
      }
    }
    extensiones.set(guardada, ext);
  }
  const ext = extensiones.get(guardada);
  return ext ? `${nombre}.${ext}` : nombre;
}

export async function leerSolicitudes(seccion: SeccionId): Promise<Solicitud[]> {
  const rol = ROL_RPS[seccion];
  if (!rol || process.env.DATASOURCE !== "rps") return [];
  const { tareas, campos } = await datos();
  const solicitudes = componerSolicitudes(tareas, campos, rol);
  let filas: FilaVista[];
  try {
    filas = await vista();
  } catch (e) {
    console.error("[solicitudes] la vista TGM_WF_COORDINA falló:", (e as Error).message);
    return solicitudes;
  }
  // Solo se miran los documentos de las solicitudes que se enseñan.
  const ids = new Set(solicitudes.map((s) => s.id.toLowerCase()));
  const nombres = new Map<string, string | null>();
  await Promise.all(
    filas
      .filter((f) => f.documentoTecnico && ids.has(f.instancia))
      .map(async (f) => nombres.set(f.instancia, await nombreDocumento(f.documentoTecnico!))),
  );
  return enriquecer(solicitudes, filas, (instancia) => nombres.get(instancia.toLowerCase()) ?? null);
}

/** La ruta y el nombre del documento del técnico de una solicitud, de la vista:
 *  el navegador solo manda el identificador de la solicitud. */
export async function documentoTecnico(instancia: string): Promise<{ guardada: string; archivo: string } | null> {
  if (process.env.DATASOURCE !== "rps") return null;
  const f = (await vista()).find((x) => x.instancia === instancia.toLowerCase());
  if (!f?.documentoTecnico) return null;
  const archivo = await nombreDocumento(f.documentoTecnico);
  return archivo ? { guardada: f.documentoTecnico, archivo } : null;
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
