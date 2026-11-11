import sql from "mssql";
import { getPool } from "./db";
import { fechaDeTexto, unaFilaPorTarea } from "../vista-belen";
import type { FilaLista, IdLista } from "../vista-belen-listas";
import { ES_RPS, FEATURE_COMPROMETIDA, iso, texto } from "./rps-belen-comun";

// ─── Vista de Belén: las consultas de las listas ─────────────────────────────
// Solo lectura, contra RPS. Cada lista sale de una hoja de sus Excels (leídos
// el 09/11/2026) con dos cambios comunes: solo pedidos AR (el desfase, también
// SA y BE), y siempre con la OF y el pedido para poder abrirlo al pinchar.
//
// Para añadir una: una función `(pool) => Promise<FilaLista[]>` en CONSULTAS,
// con la misma clave que su entrada en lib/vista-belen-listas.ts.


// ─── Tareas pendientes (hoja «comprobaciones_planificador») ──────────────────
// «Bultos subidos, tareas pendientes»: OF con todas sus unidades subidas y
// alguna tarea todavía sin acabar, sea una o sean varias (Belén, 10/11/2026:
// antes eran dos listas y las quiso en una). Tal cual su Excel (1,6 s):
// agrupando antes por OF tardaba más, 4,5 s.
async function tareasPendientes(pool: sql.ConnectionPool): Promise<FilaLista[]> {
  const r = await pool.request().query<{
    idTarea: string;
    of: string;
    pedido: string;
    cliente: string | null;
    prioridad: number | null;
    tarea: string;
    descripcion: string | null;
    maquina: string | null;
    situacion: string | null;
    fSol: Date | null;
  }>(`
    SELECT task.IDMOTask AS idTarea, mo.CodManufacturingOrder AS [of], ped.CodOrder AS pedido,
           cli.Description AS cliente, mo.Priority AS prioridad, task.CodMOTask AS tarea,
           CAST(task.Description AS varchar(300)) AS descripcion, maq.CodMachine AS maquina,
           mo_sit.Description AS situacion, lin.ReceptionDemandDate AS fSol
    FROM dbo.CPRMOTask task
    JOIN dbo.CPRManufacturingOrder mo ON task.IDManufacturingOrder = mo.IDManufacturingOrder
    JOIN dbo.CPRManufacturingOrderSituation mo_sit ON mo.IDMOSituation = mo_sit.IDManufacturingOrderSituation
    JOIN dbo.STKArticle art ON mo.IDArticle = art.IDArticle
    JOIN dbo.CPRMOResourceMachine res ON res.IDMOTask = task.IDMOTask
    LEFT JOIN dbo.CPRMachine maq ON res.IDMachine = maq.IDMachine
    JOIN dbo.FACOrderLineSL lin ON mo.IDManufacturingOrder = lin.IDManufacturingOrder
    JOIN dbo.FACOrderSL ped ON lin.IDOrder = ped.IDOrder
    LEFT JOIN dbo.FACCustomer cli ON ped.IDCustomer = cli.IDCustomer
    WHERE mo.CodCompany = '001' AND mo_sit.CodSituation < 6 AND task.PercentProgress < 100
      AND art.CodArticle <> 'diseño' AND ped.CodOrder LIKE 'AR.%'
      AND ISNULL((SELECT SUM(Quantity) FROM dbo.CPRImputationEntryProduct
                   WHERE CodCompany = '001' AND IDManufacturingOrder = mo.IDManufacturingOrder), 0) >= mo.Quantity
    ORDER BY mo.Priority, lin.ReceptionDemandDate, mo.CodManufacturingOrder, task.CodMOTask
  `);
  // Una fila por tarea aunque tenga varias máquinas, y con el mismo criterio
  // de «acabada» que la ficha del pedido: lo que OLANET ya dio por finalizado
  // no sale como pendiente aunque RPS siga sin el 100 %. Se mira después y
  // solo para estas filas: metido en la consulta grande tardaba diez veces
  // más (09/11/2026).
  const filas = unaFilaPorTarea(r.recordset.map((f) => ({ ...f, maq: f.maquina })));
  const acabadas = await finalizadasEnOlanet(pool, filas.map((f) => ({ of: f.of.trim(), tarea: f.tarea.trim() })));
  return filas
    .filter((f) => !acabadas.has(`${f.of.trim()}|${f.tarea.trim()}`))
    .map((f) => ({
      clave: f.idTarea,
      of: f.of.trim(),
      pedido: f.pedido.trim(),
      cliente: texto(f.cliente),
      prioridad: f.prioridad,
      tarea: `${f.tarea.trim()} ${(f.descripcion ?? "").trim()}`,
      maquina: texto(f.maq),
      situacion: (f.situacion ?? "").trim(),
      fechaSolicitada: iso(f.fSol),
    }));
}

/** «OF|tarea» de las que OLANET dice, en su último cambio, que están
 *  finalizadas (3). Una consulta por lista, con las OF tipadas. */
async function finalizadasEnOlanet(
  pool: sql.ConnectionPool,
  filas: ReadonlyArray<{ of: string; tarea: string }>,
): Promise<Set<string>> {
  const ordenes = [...new Set(filas.map((f) => f.of))];
  if (!ordenes.length) return new Set();
  const req = pool.request();
  const lista = ordenes.map((o, i) => (req.input(`o${i}`, sql.VarChar(20), o), `@o${i}`)).join(", ");
  const r = await req.query<{ orden: string; fase: string; idestadoof: number }>(`
    SELECT e.orden, e.fase, e.idestadoof
    FROM dbo.tgm_estadosof_olanet e
    WHERE e.orden IN (${lista})
      AND e.fecha_cambio = (SELECT MAX(x.fecha_cambio) FROM dbo.tgm_estadosof_olanet x
                             WHERE x.orden = e.orden AND x.fase = e.fase)`);
  return new Set(r.recordset.filter((e) => e.idestadoof === 3).map((e) => `${e.orden.trim()}|${e.fase.trim()}`));
}

// ─── Comprobaciones por OF ───────────────────────────────────────────────────
// Una OF puede estar enlazada a varias líneas. Para no repetirla elegimos la
// primera línea de las series pedidas (AR si no se dice otra) por pedido y
// número de línea (y por ID en caso de empate).
// En fechas comprometidas solo se elige entre las líneas pendientes de entregar.
// Los datos auxiliares son opcionales: que falte la forma de entrega o el
// cliente no debe esconder un desfase o una descripción sin rellenar.
const pedidoDe = (soloPendientes = false, series: readonly string[] = ["AR"]) => `
    CROSS APPLY (
      SELECT TOP (1) ped.CodOrder AS pedido, cli.Description AS cliente,
             lin.IDArticle, lin.ReceptionDemandDate AS fechaExigida,
             entre.DescripcionFormaEntregaPedido AS formaEntrega
      FROM dbo.FACOrderLineSL lin
      JOIN dbo.FACOrderSL ped ON ped.IDOrder = lin.IDOrder
      LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = ped.IDCustomer
      LEFT JOIN dbo._FACOrderLineSL_Custom lc ON lc.IDOrderLine = lin.IDOrderLine
      LEFT JOIN dbo._FormaEntregaPedido entre ON entre.IDFormaEntregaPedido = lc.IDFormaEntrega
      WHERE lin.IDManufacturingOrder = mo.IDManufacturingOrder
        AND lin.CodCompany = '001' AND ped.CodCompany = '001'
        AND (${series.map((s) => `ped.CodOrder LIKE '${s}.%'`).join(" OR ")})
        ${soloPendientes ? "AND lin.PendingDelivery = 1" : ""}
      ORDER BY ped.CodOrder, lin.NumLine, lin.IDOrderLine
    ) pedido`;

// Se suman las entradas antes de cruzarlas con operaciones: el Excel podía
// multiplicar las unidades si una operación tenía repetida la misma máquina.
const SUBIDAS = `
    subidas AS (
      SELECT IDManufacturingOrder, SUM(Quantity) AS cantidad
      FROM dbo.CPRImputationEntryProduct
      WHERE CodCompany = '001'
      GROUP BY IDManufacturingOrder)`;

// RPS, 09/11/2026: 1 fila, 860 ms (primera ejecución: 1.923 ms).
// El Excel AR devuelve 2 filas por sus tareas; aquí la OF sale una sola vez.
// Belén, 10/11/2026: «que aparezcan también las delegaciones» = SA y BE.
const SQL_DESFASE = `
    WITH ${SUBIDAS}
    SELECT mo.IDManufacturingOrder AS clave, mo.CodManufacturingOrder AS [of],
           pedido.pedido, pedido.cliente, CAST(art.Description AS varchar(max)) AS articulo,
           mo.Quantity AS cantidadOF, subidas.cantidad AS cantidadSubida,
           mo.Quantity - subidas.cantidad AS diferencia, pedido.formaEntrega,
           mo.ManualEndDate AS fechaFabricacion, pedido.fechaExigida
    FROM dbo.CPRManufacturingOrder mo
    JOIN dbo.CPRManufacturingOrderSituation sit ON sit.IDManufacturingOrderSituation = mo.IDMOSituation
      AND sit.CodCompany = mo.CodCompany
    JOIN subidas ON subidas.IDManufacturingOrder = mo.IDManufacturingOrder
    JOIN dbo.STKArticle art ON art.IDArticle = mo.IDArticle
    ${pedidoDe(false, ["AR", "SA", "BE"])}
    WHERE mo.CodCompany = '001' AND sit.CodSituation IN (1, 2, 3, 7)
      AND subidas.cantidad <> 0 AND subidas.cantidad <> mo.Quantity
      AND EXISTS (
        SELECT 1 FROM dbo.CPRMOTask t
        WHERE t.CodCompany = '001' AND t.IDManufacturingOrder = mo.IDManufacturingOrder
          AND t.ProductEntry = 1
          AND NULLIF(LTRIM(RTRIM(CAST(t.Description AS varchar(max)))), '') IS NOT NULL)
    ORDER BY pedido.fechaExigida, mo.CodManufacturingOrder`;

// La fecha comprometida es TEXTO americano (mm/dd/aaaa) en una característica
// de la OF. Si se apuntó varias veces, vale la ÚLTIMA (RowTimestamp), igual que
// en la ficha del pedido; y se lee con la misma función (fechaDeTexto), así las
// dos pantallas dicen siempre el mismo día. Antes la lista cogía la más
// temprana y la leía SQL: con dos fechas, cada pantalla decía una.
// Belén, 10/11/2026: «solo los pendientes de hacer». Fuera las que ya tienen
// los bultos subidos y las líneas que ya no están pendientes de entregar: las
// albaranadas (Delivered = 1) y las CUMPLIMENTADAS, que es como llama
// Producción a cerrar una línea sin albarán (Delivered = 0 y
// PendingDelivery = 0; así lo calcula TGM_ETL_BI32). Una OF finalizada no basta
// para darla por hecha: manda la entrega.
const SQL_FECHAS_COMPROMETIDAS = `
    WITH ${SUBIDAS}
    SELECT mo.IDManufacturingOrder AS clave, mo.CodManufacturingOrder AS [of],
           pedido.pedido, pedido.cliente, mo.Priority AS prioridad,
           CAST(art.Description AS varchar(max)) AS articulo, pedido.formaEntrega,
           CAST(ultima.Value AS varchar(100)) AS textoComprometida,
           sit.Description AS situacion
    FROM dbo.CPRManufacturingOrder mo
    CROSS APPLY (
      SELECT TOP (1) f.Value FROM dbo.CPRMOFeature f
      WHERE f.CodCompany = '001' AND f.IDManufacturingOrder = mo.IDManufacturingOrder
        AND f.IDFeatureLabel = '${FEATURE_COMPROMETIDA}'
      ORDER BY f.RowTimestamp DESC
    ) ultima
    JOIN dbo.CPRManufacturingOrderSituation sit ON sit.IDManufacturingOrderSituation = mo.IDMOSituation
      AND sit.CodCompany = mo.CodCompany
    ${pedidoDe(true)}
    JOIN dbo.STKArticle art ON art.IDArticle = mo.IDArticle
    LEFT JOIN subidas ON subidas.IDManufacturingOrder = mo.IDManufacturingOrder
    WHERE mo.CodCompany = '001' AND mo.Quantity > ISNULL(subidas.cantidad, 0)`;

/** La lista de fechas comprometidas: lee el texto con fechaDeTexto, descarta
 *  lo que no es una fecha y ordena de la más antigua a la más lejana. */
async function fechasComprometidas(pool: sql.ConnectionPool): Promise<FilaLista[]> {
  const filas = await comprobacion(pool, SQL_FECHAS_COMPROMETIDAS);
  return filas
    .map(({ textoComprometida, ...f }) => ({ ...f, fechaComprometida: fechaDeTexto(String(textoComprometida ?? "")) }))
    .filter((f) => f.fechaComprometida)
    .sort((a, b) => String(a.fechaComprometida).localeCompare(String(b.fechaComprometida)) || String(a.of).localeCompare(String(b.of)));
}

// El recuento se hace antes de unir pedidos; varias líneas del pedido no
// pueden convertir una sola asignación de máquina en un falso aviso.
// COUNT(*) conserva el criterio del Excel: también avisa de asignaciones
// duplicadas a la misma máquina. El listado de nombres, en cambio, no repite.
// RPS es SQL Server 2014: se concatena con FOR XML, que además conserva los
// nombres con «&» y «<» al extraer el valor, en lugar de STRING_AGG (2017).
// RPS, 09/11/2026: 0 filas, 565 ms (Excel AR: también 0). Agrupando todas las
// operaciones antes de filtrar OF abiertas tardaba 5.535 ms: se filtra dentro.
const SQL_VARIAS_MAQUINAS = `
    WITH operaciones AS (
      SELECT t.IDMOTask, t.IDManufacturingOrder, t.CodMOTask
      FROM dbo.CPRManufacturingOrder abierta WITH (NOLOCK)
      JOIN dbo.CPRManufacturingOrderSituation estado WITH (NOLOCK)
        ON estado.IDManufacturingOrderSituation = abierta.IDMOSituation
          AND estado.CodCompany = abierta.CodCompany
      JOIN dbo.CPRMOTask t WITH (NOLOCK) ON t.IDManufacturingOrder = abierta.IDManufacturingOrder
      JOIN dbo.CPRMOResourceMachine rm WITH (NOLOCK) ON rm.IDMOTask = t.IDMOTask
      JOIN dbo.CPRMachine m WITH (NOLOCK) ON m.IDMachine = rm.IDMachine
        AND m.CodMachine = rm.CodMOResourceMachine
      WHERE abierta.CodCompany = '001' AND t.CodCompany = '001' AND estado.AllowImputations = 1
      GROUP BY t.IDMOTask, t.IDManufacturingOrder, t.CodMOTask
      HAVING COUNT(*) > 1)
    SELECT op.IDMOTask AS clave, mo.CodManufacturingOrder AS [of],
           pedido.pedido, pedido.cliente, op.CodMOTask AS tarea, nombres.maquinas
    FROM operaciones op
    JOIN dbo.CPRManufacturingOrder mo WITH (NOLOCK) ON mo.IDManufacturingOrder = op.IDManufacturingOrder
    JOIN dbo.CPRManufacturingOrderSituation sit WITH (NOLOCK)
      ON sit.IDManufacturingOrderSituation = mo.IDMOSituation AND sit.CodCompany = mo.CodCompany
    ${pedidoDe()}
    CROSS APPLY (
      SELECT STUFF((
        SELECT ', ' + maquinas.codigo
        FROM (
          SELECT DISTINCT LTRIM(RTRIM(m.CodMachine)) AS codigo
          FROM dbo.CPRMOResourceMachine rm WITH (NOLOCK)
          JOIN dbo.CPRMachine m WITH (NOLOCK) ON m.IDMachine = rm.IDMachine
            AND m.CodMachine = rm.CodMOResourceMachine
          WHERE rm.IDMOTask = op.IDMOTask
        ) maquinas
        ORDER BY maquinas.codigo
        FOR XML PATH(''), TYPE).value('.', 'varchar(max)'), 1, 2, '') AS maquinas
    ) nombres
    WHERE mo.CodCompany = '001' AND sit.AllowImputations = 1
    ORDER BY mo.CodManufacturingOrder, op.CodMOTask`;

// Description puede ser text/ntext: hay que convertir antes de recortar.
// Así entran también las vacías y las de solo espacios, no únicamente NULL.
// RPS, 09/11/2026: 0 filas, 135 ms (Excel AR, solo NULL: también 0).
const SQL_SIN_DESCRIPCION = `
    SELECT mo.IDManufacturingOrder AS clave, mo.CodManufacturingOrder AS [of],
           pedido.pedido, pedido.cliente, mo.Quantity AS cantidad,
           mo.PlannedStartDate AS fechaInicio, mo.InternalCode AS referencia
    FROM dbo.CPRManufacturingOrder mo WITH (NOLOCK)
    JOIN dbo.CPRManufacturingOrderSituation sit WITH (NOLOCK)
      ON sit.IDManufacturingOrderSituation = mo.IDMOSituation AND sit.CodCompany = mo.CodCompany
    ${pedidoDe()}
    WHERE mo.CodCompany = '001' AND sit.AllowImputations = 1
      AND NULLIF(LTRIM(RTRIM(CAST(mo.Description AS varchar(max)))), '') IS NULL
    ORDER BY mo.CodManufacturingOrder`;

type FilaListaRPS = {
  clave: string;
  of: string;
  pedido: string;
} & Record<string, string | number | Date | null>;

async function comprobacion(pool: sql.ConnectionPool, consulta: string): Promise<FilaLista[]> {
  const r = await pool.request().query<FilaListaRPS>(consulta);
  return r.recordset.map((f) => ({
    ...Object.fromEntries(Object.entries(f).map(([k, v]) => [
      k, v instanceof Date ? iso(v) : typeof v === "string" ? texto(v) : v,
    ])),
    clave: f.clave.trim(),
    of: f.of.trim(),
    pedido: f.pedido.trim(),
  }));
}

// Diferencias con los Excels, a propósito (09/11/2026): una fila por OF y no
// por tarea o máquina (sus joins repetían la OF y podían inflar unidades);
// cliente y forma de entrega opcionales, para que su falta no esconda un aviso;
// cada lista conserva la situación de OF que filtraba su Excel.

// ─── El registro ─────────────────────────────────────────────────────────────

export const CONSULTAS: Record<IdLista, (pool: sql.ConnectionPool) => Promise<FilaLista[]>> = {
  "bultos-subidos": (pool) => tareasPendientes(pool),
  "desfase": (pool) => comprobacion(pool, SQL_DESFASE),
  "fechas-comprometidas": (pool) => fechasComprometidas(pool),
  "varias-maquinas": (pool) => comprobacion(pool, SQL_VARIAS_MAQUINAS),
  "sin-descripcion": (pool) => comprobacion(pool, SQL_SIN_DESCRIPCION),
};

/** Las listas cuestan de medio segundo a cuatro («bultos subidos, tareas
 *  pendientes»; reescribirla agrupando por OF tardaba aún más, 12-17 s). Para que
 *  Belén no espere, se sirve lo último que se calculó y, si tiene más de
 *  FRESCA_MS, se recalcula POR DETRÁS para la siguiente vez (Iván, 10/11/2026:
 *  «las cargas de las listas deberíamos mejorarlas»). Pasado CADUCA_MS ya no
 *  se enseña algo tan viejo: se espera a la consulta. */
const FRESCA_MS = 2 * 60_000;
const CADUCA_MS = 30 * 60_000;

interface Guardada {
  /** Cuándo se calcularon las filas que hay. */
  at: number;
  filas: FilaLista[] | null;
  /** La consulta en marcha, si la hay: dos peticiones a la vez esperan a la misma. */
  enCurso: Promise<FilaLista[]> | null;
}
const cache = new Map<IdLista, Guardada>();

/** Solo para los tests: que uno no herede lo guardado por otro. */
export function olvidarListasBelen(): void {
  cache.clear();
}

function recalcular(id: IdLista, g: Guardada): Promise<FilaLista[]> {
  if (g.enCurso) return g.enCurso;
  const p = (ES_RPS() ? getPool().then((pool) => CONSULTAS[id](pool)) : Promise.resolve([]))
    .then((filas) => {
      g.filas = filas;
      g.at = Date.now();
      return filas;
    })
    .finally(() => {
      g.enCurso = null;
    });
  g.enCurso = p;
  return p;
}

/** Las filas y su edad, para que la pantalla pueda decir «actualizado hace…». */
export async function leerListaBelen(id: IdLista): Promise<{ filas: FilaLista[]; calculadaAt: string }> {
  const ahora = Date.now();
  let g = cache.get(id);
  if (!g) {
    g = { at: 0, filas: null, enCurso: null };
    cache.set(id, g);
  }
  const edad = ahora - g.at;
  if (g.filas && edad < CADUCA_MS) {
    // Lo que hay, ya; y si está pasada, se renueva para la próxima. El error
    // de esa renovación no le llega a nadie: se reintenta en la siguiente.
    if (edad >= FRESCA_MS) recalcular(id, g).catch(() => {});
    return { filas: g.filas, calculadaAt: new Date(g.at).toISOString() };
  }
  const filas = await recalcular(id, g);
  return { filas, calculadaAt: new Date(g.at).toISOString() };
}
