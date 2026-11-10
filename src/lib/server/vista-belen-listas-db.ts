import sql from "mssql";
import { getPool } from "./db";
import { unaFilaPorTarea } from "../vista-belen";
import type { FilaLista, IdLista } from "../vista-belen-listas";

// ─── Vista de Belén: las consultas de las listas ─────────────────────────────
// Solo lectura, contra RPS. Cada lista sale de una hoja de sus Excels (leídos
// el 09/11/2026) con dos cambios comunes: solo pedidos AR, y siempre con la OF
// y el pedido para poder abrirlo al pinchar.
//
// Para añadir una: una función `(pool) => Promise<FilaLista[]>` en CONSULTAS,
// con la misma clave que su entrada en lib/vista-belen-listas.ts.

const ES_RPS = () => process.env.DATASOURCE === "rps";

const iso = (d: Date | null | undefined): string | null =>
  d && d.getFullYear() > 1900 ? d.toISOString().slice(0, 10) : null;
const texto = (s: string | null | undefined): string | null => (s ?? "").trim() || null;

// ─── Tareas pendientes (hoja «comprobaciones_planificador») ──────────────────
// Un CTE opcional con las OF que entran y una condición más por tarea. Medido
// contra RPS el 09/11/2026.
const TAREAS: Record<"una-tarea" | "bultos-subidos", { cte: string; donde: string }> = {
  // «OF con 1 tarea sin finalizar»: la tarea sin acabar es la ÚNICA de su OF.
  // Su Excel lo preguntaba tarea a tarea con una subconsulta (24 s); contando
  // primero por OF, las mismas 65 filas salen en 0,4-0,7 s.
  "una-tarea": {
    cte: `
      WITH abiertas AS (
        SELECT mo.IDManufacturingOrder AS id FROM dbo.CPRManufacturingOrder mo
        JOIN dbo.CPRManufacturingOrderSituation s ON s.IDManufacturingOrderSituation = mo.IDMOSituation
        WHERE mo.CodCompany = '001' AND s.CodSituation < 6),
      elegidas AS (
        SELECT t.IDManufacturingOrder AS id FROM dbo.CPRMOTask t
        JOIN abiertas a ON a.id = t.IDManufacturingOrder
        WHERE t.CodCompany = '001' AND t.PercentProgress <> 100
        GROUP BY t.IDManufacturingOrder HAVING COUNT(*) = 1)`,
    donde: "AND mo.IDManufacturingOrder IN (SELECT id FROM elegidas)",
  },
  // «Tareas pendientes bultos subidos»: OF con todas sus unidades subidas y
  // alguna tarea todavía sin acabar. Tal cual su Excel (1,6 s): agrupando
  // antes por OF tardaba más, 4,5 s.
  "bultos-subidos": {
    cte: "",
    donde: `
      AND ISNULL((SELECT SUM(Quantity) FROM dbo.CPRImputationEntryProduct
                   WHERE CodCompany = '001' AND IDManufacturingOrder = mo.IDManufacturingOrder), 0) >= mo.Quantity`,
  },
};

async function tareasPendientes(pool: sql.ConnectionPool, cual: keyof typeof TAREAS): Promise<FilaLista[]> {
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
  }>(`${TAREAS[cual].cte}
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
      ${TAREAS[cual].donde}
    ORDER BY mo.Priority, lin.ReceptionDemandDate, mo.CodManufacturingOrder, task.CodMOTask
  `);
  // Una fila por tarea aunque tenga varias máquinas, y con el mismo criterio
  // de «acabada» que la ficha del pedido: lo que OLANET ya dio por finalizado
  // no sale como pendiente aunque RPS siga sin el 100 %. Se mira después y
  // solo para estas filas: metido en la consulta grande, «una tarea» pasaba
  // de medio segundo a seis (09/11/2026).
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
// primera línea AR por pedido/número de línea (y por ID en caso de empate).
// En fechas comprometidas solo se elige entre las líneas aún sin facturar.
// Los datos auxiliares son opcionales: que falte la forma de entrega o el
// cliente no debe esconder un desfase o una descripción sin rellenar.
const pedidoAR = (sinFacturar = false) => `
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
        AND lin.CodCompany = '001' AND ped.CodCompany = '001' AND ped.CodOrder LIKE 'AR.%'
        ${sinFacturar ? "AND lin.Quantity > lin.InvoicedQuantity" : ""}
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
    ${pedidoAR()}
    WHERE mo.CodCompany = '001' AND sit.CodSituation IN (1, 2, 3, 7)
      AND subidas.cantidad <> 0 AND subidas.cantidad <> mo.Quantity
      AND EXISTS (
        SELECT 1 FROM dbo.CPRMOTask t
        WHERE t.CodCompany = '001' AND t.IDManufacturingOrder = mo.IDManufacturingOrder
          AND t.ProductEntry = 1
          AND NULLIF(LTRIM(RTRIM(CAST(t.Description AS varchar(max)))), '') IS NOT NULL)
    ORDER BY pedido.fechaExigida, mo.CodManufacturingOrder`;

// Value es texto AMERICANO, no dd/mm/aaaa. Una característica mal escrita no
// tumba toda la lista: TRY_CONVERT la descarta (NULLIF evita que un texto vacío
// se convierta en 1900). Si se repite la característica,
// mostramos el compromiso válido más temprano, para no ocultar el más urgente.
// RPS, 09/11/2026: 122 filas, 207 ms. Contraste de conjuntos: las mismas 122
// OF que las 466 filas del Excel AR; ninguna OF añadida ni perdida.
const SQL_FECHAS_COMPROMETIDAS = `
    WITH compromisos AS (
      SELECT IDManufacturingOrder,
             MIN(TRY_CONVERT(date, NULLIF(LTRIM(RTRIM(CAST(Value AS varchar(100)))), ''), 101)) AS fechaComprometida
      FROM dbo.CPRMOFeature
      WHERE CodCompany = '001' AND IDFeatureLabel = 'e655eb1f-3f23-4ccb-846b-9e145d3b8df6'
      GROUP BY IDManufacturingOrder
      HAVING MIN(TRY_CONVERT(date, NULLIF(LTRIM(RTRIM(CAST(Value AS varchar(100)))), ''), 101)) IS NOT NULL),
    ${SUBIDAS}
    SELECT mo.IDManufacturingOrder AS clave, mo.CodManufacturingOrder AS [of],
           pedido.pedido, pedido.cliente, mo.Priority AS prioridad,
           art.CodArticle AS articulo, pedido.formaEntrega, compromisos.fechaComprometida,
           CASE WHEN mo.Quantity > ISNULL(subidas.cantidad, 0) THEN 'NO' ELSE 'SI' END AS bultosSubidos
    FROM compromisos
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = compromisos.IDManufacturingOrder
    ${pedidoAR(true)}
    JOIN dbo.STKArticle art ON art.IDArticle = pedido.IDArticle
    LEFT JOIN subidas ON subidas.IDManufacturingOrder = mo.IDManufacturingOrder
    WHERE mo.CodCompany = '001'
    ORDER BY compromisos.fechaComprometida, mo.CodManufacturingOrder`;

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
    ${pedidoAR()}
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
    ${pedidoAR()}
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
  "una-tarea": (pool) => tareasPendientes(pool, "una-tarea"),
  "bultos-subidos": (pool) => tareasPendientes(pool, "bultos-subidos"),
  "desfase": (pool) => comprobacion(pool, SQL_DESFASE),
  "fechas-comprometidas": (pool) => comprobacion(pool, SQL_FECHAS_COMPROMETIDAS),
  "varias-maquinas": (pool) => comprobacion(pool, SQL_VARIAS_MAQUINAS),
  "sin-descripcion": (pool) => comprobacion(pool, SQL_SIN_DESCRIPCION),
};

/** Las listas cuestan de medio segundo a cuatro («pendientes con bultos
 *  subidos»; reescribirla agrupando por OF tardaba aún más, 12-17 s). Para que
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
