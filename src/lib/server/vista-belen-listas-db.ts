import sql from "mssql";
import { getPool } from "./db";
import { fechaDeTexto, unaFilaPorTarea } from "../vista-belen";
import type { FilaLista, IdLista } from "../vista-belen-listas";
import { ES_RPS, FEATURE_COMPROMETIDA, horaDeSegundos, iso, texto, TIPO_AVISO } from "./rps-belen-comun";
import { nombreHistorial } from "../nombre-historial";

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
/** Arzúa y las delegaciones (Santiago y Bergondo). */
const SERIES_TODAS = ["AR", "SA", "BE"] as const;

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

// «Tareas finalizadas, bultos pendientes» (su hoja «Tare finalizadas bultos
// pendien», Belén 20/11/2026): la operación que sube el producto
// (ProductEntry = 1) está al 100 % en una OF sin finalizar, pero no se han
// subido todas las unidades. Su Excel cruzaba con las líneas de pedido y
// repetía la OF por línea; aquí sale una vez, con la primera línea AR.
// Medido el 20/11/2026: 2 filas en 1,1 s, las mismas que su Excel. No se mira
// OLANET para dar la tarea por acabada (sí en la lista de arriba): de las 312
// operaciones así por debajo del 100 %, ninguna estaba finalizada en OLANET, y
// mirarlo costaba 3 s más.
const SQL_FINALIZADAS_BULTOS = `
    WITH ${SUBIDAS}
    SELECT task.IDMOTask AS idTarea, mo.CodManufacturingOrder AS [of], pedido.pedido, pedido.cliente,
           mo.Priority AS prioridad, task.CodMOTask AS tarea, CAST(task.Description AS varchar(300)) AS descripcion,
           maq.CodMachine AS maq, sit.Description AS situacion, pedido.fechaExigida AS fSol,
           mo.Quantity AS cantidadOF, ISNULL(subidas.cantidad, 0) AS cantidadSubida
    FROM dbo.CPRMOTask task
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = task.IDManufacturingOrder
    JOIN dbo.CPRManufacturingOrderSituation sit ON sit.IDManufacturingOrderSituation = mo.IDMOSituation
      AND sit.CodCompany = mo.CodCompany
    JOIN dbo.STKArticle art ON art.IDArticle = mo.IDArticle
    LEFT JOIN subidas ON subidas.IDManufacturingOrder = mo.IDManufacturingOrder
    LEFT JOIN dbo.CPRMOResourceMachine res ON res.IDMOTask = task.IDMOTask
    LEFT JOIN dbo.CPRMachine maq ON maq.IDMachine = res.IDMachine
    ${pedidoDe()}
    WHERE mo.CodCompany = '001' AND sit.CodSituation < 6
      AND task.PercentProgress = 100 AND task.ProductEntry = 1 AND art.CodArticle <> 'diseño'
      AND ISNULL(subidas.cantidad, 0) < mo.Quantity
    ORDER BY mo.Priority, pedido.fechaExigida, mo.CodManufacturingOrder, task.CodMOTask`;

async function finalizadasBultosPendientes(pool: sql.ConnectionPool): Promise<FilaLista[]> {
  const r = await pool.request().query<{
    idTarea: string;
    of: string;
    pedido: string;
    cliente: string | null;
    prioridad: number | null;
    tarea: string;
    descripcion: string | null;
    maq: string | null;
    situacion: string | null;
    fSol: Date | null;
    cantidadOF: number;
    cantidadSubida: number;
  }>(SQL_FINALIZADAS_BULTOS);
  return unaFilaPorTarea(r.recordset).map((f) => ({
    clave: f.idTarea,
    of: f.of.trim(),
    pedido: f.pedido.trim(),
    cliente: texto(f.cliente),
    prioridad: f.prioridad,
    tarea: `${f.tarea.trim()} ${(f.descripcion ?? "").trim()}`,
    maquina: texto(f.maq),
    cantidadOF: Number(f.cantidadOF),
    cantidadSubida: Number(f.cantidadSubida),
    situacion: (f.situacion ?? "").trim(),
    fechaSolicitada: iso(f.fSol),
  }));
}

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
  of: string | null;
  pedido: string;
} & Record<string, string | number | Date | null>;

async function comprobacion(pool: sql.ConnectionPool, consulta: string): Promise<FilaLista[]> {
  const r = await pool.request().query<FilaListaRPS>(consulta);
  return r.recordset.map((f) => ({
    ...Object.fromEntries(Object.entries(f).map(([k, v]) => [
      k, v instanceof Date ? iso(v) : typeof v === "string" ? texto(v) : v,
    ])),
    clave: String(f.clave).trim(),
    of: f.of ? f.of.trim() : null,
    pedido: f.pedido.trim(),
  }));
}

// ─── Listas del 12/11/2026 ───────────────────────────────────────────────────

/** Minutos de una tarea según su unidad: RPS guarda ExecutionTime en minutos
 *  (TimeUnit 1) o en horas (TimeUnit 2: 90 tareas abiertas el 12/11/2026,
 *  casi todas de delegaciones). */
const MINUTOS_TAREA = (t: string) => `CASE ${t}.TimeUnit WHEN 2 THEN ${t}.ExecutionTime * 60 ELSE ${t}.ExecutionTime END`;

/** Tareas por hacer de OF abiertas (sin diseño, como sus Excels), una fila por
 *  tarea con sus máquinas juntas y sin las que OLANET ya dio por acabadas. */
async function tareasConTiempo(
  pool: sql.ConnectionPool,
  condicion: string,
  situaciones: string,
  series: readonly string[] = ["AR"],
): Promise<Array<FilaLista & { minutos: number }>> {
  const r = await pool.request().query<{
    idTarea: string;
    of: string;
    pedido: string;
    cliente: string | null;
    prioridad: number | null;
    tarea: string;
    descripcion: string | null;
    maq: string | null;
    situacion: string | null;
    fSol: Date | null;
    minutos: number | null;
  }>(`
    SELECT task.IDMOTask AS idTarea, mo.CodManufacturingOrder AS [of], pedido.pedido, pedido.cliente,
           mo.Priority AS prioridad, task.CodMOTask AS tarea, CAST(task.Description AS varchar(300)) AS descripcion,
           rm.CodMOResourceMachine AS maq, sit.Description AS situacion, pedido.fechaExigida AS fSol,
           ${MINUTOS_TAREA("task")} AS minutos
    FROM dbo.CPRMOTask task
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = task.IDManufacturingOrder
    JOIN dbo.CPRManufacturingOrderSituation sit ON sit.IDManufacturingOrderSituation = mo.IDMOSituation
      AND sit.CodCompany = mo.CodCompany
    JOIN dbo.STKArticle art ON art.IDArticle = mo.IDArticle
    JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = task.IDMOTask
    ${pedidoDe(false, series)}
    WHERE task.CodCompany = '001' AND ${situaciones} AND task.PercentProgress < 100
      AND art.CodArticle <> 'diseño' AND ${condicion}
    ORDER BY mo.Priority, pedido.fechaExigida, mo.CodManufacturingOrder, task.CodMOTask`);
  const filas = unaFilaPorTarea(r.recordset);
  const acabadas = await finalizadasEnOlanet(pool, filas.map((f) => ({ of: f.of.trim(), tarea: f.tarea.trim() })));
  return filas
    .filter((f) => !acabadas.has(`${f.of.trim()}|${f.tarea.trim()}`))
    .map((f) => {
      const minutos = Number(f.minutos) || 0;
      return {
        clave: f.idTarea,
        of: f.of.trim(),
        pedido: f.pedido.trim(),
        cliente: texto(f.cliente),
        prioridad: f.prioridad,
        tarea: `${f.tarea.trim()} ${(f.descripcion ?? "").trim()}`,
        maquina: texto(f.maq),
        horas: Math.round(minutos / 6) / 10,
        situacion: (f.situacion ?? "").trim(),
        fechaSolicitada: iso(f.fSol),
        minutos,
      };
    });
}

// Belén, 14/11/2026: sustituye a «Tiempo previsto 0 u 8 h o más» (sus hojas
// «Tareas tiempo 0» y «Tareas 8 horas»). Una fila por OF en marcha
// (situaciones 1-5) que no tiene tiempo previsto en NINGUNA operación: si
// alguna lo tiene, alguien ya la planificó. Medido el 14/11/2026: 126 OF
// abiertas así, y solo 12 con tiempo en unas operaciones y en otras no.
// Casi todas son de Santiago (106 de 115): se traen AR, SA y BE, y la pantalla
// enseña solo AR hasta que se marca «Ver delegaciones». Con NOT EXISTS y no
// sumando todas las tareas: 0,8 s en vez de 10 s.
// Iván, 16/11/2026: fuera las que ya están hechas aunque RPS no las cierre:
// bultos todos subidos y todas sus tareas finalizadas (RPS al 100 % u OLANET,
// el mismo criterio que la ficha). Caso: AR.21.00731, «Lanzada» desde 2021.
const SQL_SIN_TIEMPOS = `
    WITH ${SUBIDAS}
    SELECT mo.IDManufacturingOrder AS clave, mo.CodManufacturingOrder AS [of], pedido.pedido, pedido.cliente,
           mo.Priority AS prioridad, CAST(art.Description AS varchar(300)) AS articulo,
           ops.operaciones, sit.Description AS situacion, pedido.fechaExigida AS fechaSolicitada,
           CASE WHEN ISNULL(subidas.cantidad, 0) >= mo.Quantity AND mo.Quantity > 0 THEN 1 ELSE 0 END AS bultosSubidos
    FROM dbo.CPRManufacturingOrder mo
    LEFT JOIN subidas ON subidas.IDManufacturingOrder = mo.IDManufacturingOrder
    JOIN dbo.CPRManufacturingOrderSituation sit ON sit.IDManufacturingOrderSituation = mo.IDMOSituation
      AND sit.CodCompany = mo.CodCompany
    JOIN dbo.STKArticle art ON art.IDArticle = mo.IDArticle
    ${pedidoDe(false, SERIES_TODAS)}
    CROSS APPLY (
      SELECT COUNT(*) AS operaciones FROM dbo.CPRMOTask t WHERE t.IDManufacturingOrder = mo.IDManufacturingOrder
    ) ops
    WHERE mo.CodCompany = '001' AND sit.CodSituation IN ('1', '2', '3', '4', '5')
      AND art.CodArticle <> 'diseño' AND ops.operaciones > 0
      AND NOT EXISTS (SELECT 1 FROM dbo.CPRMOTask t
                      WHERE t.IDManufacturingOrder = mo.IDManufacturingOrder AND t.ExecutionTime > 0)
    ORDER BY mo.Priority, pedido.fechaExigida, mo.CodManufacturingOrder`;

/** «OF sin tiempos» sin las ya rematadas: bultos subidos y ninguna tarea
 *  pendiente, ni en RPS (< 100 %) ni sin finalizar en OLANET. */
async function sinTiempos(pool: sql.ConnectionPool): Promise<FilaLista[]> {
  const filas = await comprobacion(pool, SQL_SIN_TIEMPOS);
  const conBultos = [...new Set(filas.filter((f) => f.bultosSubidos === 1 && f.of).map((f) => String(f.of)))];
  const conPendientes = new Set<string>();
  if (conBultos.length) {
    const req = pool.request();
    const lista = conBultos.map((o, i) => (req.input(`o${i}`, sql.VarChar(20), o), `@o${i}`)).join(", ");
    const r = await req.query<{ of: string; tarea: string }>(`
      SELECT mo.CodManufacturingOrder AS [of], t.CodMOTask AS tarea
      FROM dbo.CPRMOTask t
      JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = t.IDManufacturingOrder
      WHERE mo.CodCompany = '001' AND mo.CodManufacturingOrder IN (${lista})
        AND ISNULL(t.PercentProgress, 0) < 100`);
    const abiertas = r.recordset.map((t) => ({ of: t.of.trim(), tarea: t.tarea.trim() }));
    const acabadas = await finalizadasEnOlanet(pool, abiertas);
    for (const t of abiertas) if (!acabadas.has(`${t.of}|${t.tarea}`)) conPendientes.add(t.of);
  }
  return filas
    .filter((f) => f.bultosSubidos !== 1 || conPendientes.has(String(f.of)))
    .map(({ bultosSubidos, ...f }) => (void bultosSubidos, f));
}

// La hoja «Tareas» de «carga_por_maquina_datos_planificador», que Belén
// filtraba por máquina A- y unidad «horas». Desde el 14/11/2026, cualquier
// máquina: lo que importa es la unidad mal puesta. Toda OF no finalizada.
// En Arzúa, las tareas en horas son visitas y «Materiales», sin máquina (no
// entran); las de verdad son de Santiago, que se ven con «Ver delegaciones».
async function tareasEnHoras(pool: sql.ConnectionPool): Promise<FilaLista[]> {
  const filas = await tareasConTiempo(pool, "task.TimeUnit = 2", "sit.CodSituation <> '6'", SERIES_TODAS);
  return filas.map(({ minutos, ...f }) => (void minutos, f));
}

// CPRImputationOnLine = lo que OLANET mandó y RPS no ha podido imputar. El 12/11
// eran 4 fichajes de una OF detenida (y 117 viejos de OF con imputaciones o
// finalizadas, de 2024: no son de esta lista). La OF «001-0000001» es la de
// las tareas indirectas, como en su Excel.
const SQL_TIEMPOS_SIN_SUBIR = `
    SELECT mo.IDManufacturingOrder AS clave, mo.CodManufacturingOrder AS [of], pedido.pedido, pedido.cliente,
           mo.Priority AS prioridad, CAST(art.Description AS varchar(max)) AS articulo,
           imp.fichajes, imp.desde, imp.hasta, pedido.fechaExigida AS fechaSolicitada
    FROM dbo.CPRManufacturingOrder mo
    JOIN dbo.CPRManufacturingOrderSituation sit ON sit.IDManufacturingOrderSituation = mo.IDMOSituation
      AND sit.CodCompany = mo.CodCompany
    JOIN dbo.STKArticle art ON art.IDArticle = mo.IDArticle
    CROSS APPLY (
      SELECT COUNT(*) AS fichajes, MIN(i.ImputationDate) AS desde, MAX(i.ImputationDate) AS hasta
      FROM dbo.CPRImputationOnLine i
      WHERE i.CodCompany = '001' AND i.IDManufacturingOrder = mo.IDManufacturingOrder
      HAVING COUNT(*) > 0
    ) imp
    ${pedidoDe()}
    WHERE mo.CodCompany = '001' AND mo.IDManufacturingOrder <> '001-0000001' AND sit.CodSituation = '7'
    ORDER BY imp.desde, mo.CodManufacturingOrder`;

// Sus dos hojas de delimitación, tal cual las consulta su Excel (Belén,
// 14/11/2026: la versión anterior, «planificada antes de la delimitación» con
// el tipo 7, sacaba delimitaciones de 2035 que no eran ningún fallo):
// - «Fecha delimitación incorrecta»: la delimitación ya pasó, o cae después
//   de la fecha de fabricación (ManualEndDate). Cualquier tipo.
// - «Fecha delimita<>fecha planific»: «empezar el» (tipo 6) en otro día que
//   el que puso el planificador.
// Como su Excel, solo tareas con alguna máquina.
const SQL_DELIMITACION = `
    SELECT task.IDMOTask AS clave, mo.CodManufacturingOrder AS [of], pedido.pedido, pedido.cliente,
           mo.Priority AS prioridad, task.CodMOTask + ' ' + CAST(task.Description AS varchar(300)) AS tarea,
           STUFF((SELECT DISTINCT ', ' + LTRIM(RTRIM(rm.CodMOResourceMachine)) FROM dbo.CPRMOResourceMachine rm
             WHERE rm.IDMOTask = task.IDMOTask FOR XML PATH(''), TYPE).value('.', 'varchar(max)'), 1, 2, '') AS maquina,
           CASE
             WHEN task.DelimitationDate < CONVERT(date, GETDATE()) THEN 'Ya pasada'
             WHEN task.DelimitationDate > task.ManualEndDate THEN 'Después de fabricación'
             ELSE 'Distinta de la planificada'
           END AS problema,
           task.DelimitationDate AS fechaDelimitacion, task.ManualEndDate AS fechaFabricacion,
           task.PlannedStartDate AS fechaPlanificada, sit.Description AS situacion
    FROM dbo.CPRMOTask task
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = task.IDManufacturingOrder
    JOIN dbo.CPRManufacturingOrderSituation sit ON sit.IDManufacturingOrderSituation = mo.IDMOSituation
      AND sit.CodCompany = mo.CodCompany
    JOIN dbo.STKArticle art ON art.IDArticle = mo.IDArticle
    ${pedidoDe()}
    WHERE task.CodCompany = '001' AND sit.CodSituation IN ('0', '1', '2', '3', '4', '5')
      AND task.PercentProgress < 100 AND art.CodArticle <> 'diseño' AND task.DelimitationDate IS NOT NULL
      AND EXISTS (SELECT 1 FROM dbo.CPRMOResourceMachine rm JOIN dbo.CPRMachine maq ON maq.IDMachine = rm.IDMachine
                  WHERE rm.IDMOTask = task.IDMOTask)
      AND (task.DelimitationDate < CONVERT(date, GETDATE())
        OR task.DelimitationDate > task.ManualEndDate
        OR (task.DelimitationType = 6 AND CONVERT(date, task.PlannedStartDate) <> CONVERT(date, task.DelimitationDate)))
    ORDER BY task.DelimitationDate, mo.CodManufacturingOrder, task.CodMOTask`;

// Su hoja «OF detenidas material recibido»: detenida, con compras y ninguna
// por recibir, con alguna operación de máquina de Arzúa, sin las unidades
// subidas y sin TP ni COT (esas se detienen esperando la visita).
// Primero las detenidas y sus compras, y después lo demás: sumando las
// entradas de TODAS las OF (como en las otras listas) tardaba 6,7 s; así,
// menos de un segundo (12/11/2026: 82 detenidas, 9 con compras, 0 recibidas).
const SQL_DETENIDAS_MATERIAL = `
    WITH detenidas AS (
      SELECT mo.IDManufacturingOrder
      FROM dbo.CPRManufacturingOrder mo
      JOIN dbo.CPRManufacturingOrderSituation sit ON sit.IDManufacturingOrderSituation = mo.IDMOSituation
        AND sit.CodCompany = mo.CodCompany
      WHERE mo.CodCompany = '001' AND sit.CodSituation = '7'),
    compras AS (
      SELECT l.IDManufacturingOrder, COUNT(*) AS lineas,
             SUM(CASE WHEN l.Quantity > l.ReceivedQuantity THEN 1 ELSE 0 END) AS pendientes
      FROM dbo.PUROrderLine l
      JOIN detenidas d ON d.IDManufacturingOrder = l.IDManufacturingOrder
      WHERE l.CodCompany = '001'
      GROUP BY l.IDManufacturingOrder)
    SELECT mo.IDManufacturingOrder AS clave, mo.CodManufacturingOrder AS [of], pedido.pedido, pedido.cliente,
           mo.Priority AS prioridad, CAST(art.Description AS varchar(max)) AS articulo,
           compras.lineas, pedido.fechaExigida AS fechaSolicitada
    FROM compras
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = compras.IDManufacturingOrder
    JOIN dbo.STKArticle art ON art.IDArticle = mo.IDArticle
    ${pedidoDe()}
    WHERE compras.pendientes = 0
      AND mo.Quantity > ISNULL((SELECT SUM(e.Quantity) FROM dbo.CPRImputationEntryProduct e
                                 WHERE e.CodCompany = '001' AND e.IDManufacturingOrder = mo.IDManufacturingOrder), 0)
      AND EXISTS (
        SELECT 1 FROM dbo.CPRMOTask t
        JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = t.IDMOTask
        WHERE t.IDManufacturingOrder = mo.IDManufacturingOrder AND rm.CodMOResourceMachine LIKE 'A-%')
      AND NOT EXISTS (
        SELECT 1 FROM dbo.CPRMOTask t
        JOIN dbo._CPRMOTask_Custom c ON c.IDMOTask = t.IDMOTask
        WHERE t.IDManufacturingOrder = mo.IDManufacturingOrder AND c.IDMaintenanceWarning IS NOT NULL)
    ORDER BY pedido.fechaExigida, mo.Priority, mo.CodManufacturingOrder`;

// Compras por recibir de OF no finalizadas cuyo pedido sigue sin entregar.
// «Llega» = la fecha prevista más lejana de lo que falta.
const SQL_COMPRAS_PENDIENTES = `
    SELECT mo.IDManufacturingOrder AS clave, mo.CodManufacturingOrder AS [of], pedido.pedido, pedido.cliente,
           mo.Priority AS prioridad, CAST(art.Description AS varchar(max)) AS articulo,
           compras.lineas, compras.llega, sit.Description AS situacion, pedido.fechaExigida AS fechaSolicitada
    FROM dbo.CPRManufacturingOrder mo
    JOIN dbo.CPRManufacturingOrderSituation sit ON sit.IDManufacturingOrderSituation = mo.IDMOSituation
      AND sit.CodCompany = mo.CodCompany
    JOIN dbo.STKArticle art ON art.IDArticle = mo.IDArticle
    CROSS APPLY (
      SELECT COUNT(*) AS lineas, MAX(l.ReceptionDate) AS llega
      FROM dbo.PUROrderLine l
      WHERE l.CodCompany = '001' AND l.IDManufacturingOrder = mo.IDManufacturingOrder
        AND l.Quantity > l.ReceivedQuantity
      HAVING COUNT(*) > 0
    ) compras
    ${pedidoDe(true)}
    WHERE mo.CodCompany = '001' AND sit.CodSituation <> '6'`;

/** Por fecha solicitada (sin fecha, al final) y, el mismo día, por prioridad. */
const porSolicitadaYPrioridad = (a: FilaLista, b: FilaLista) =>
  (a.fechaSolicitada === null ? 1 : 0) - (b.fechaSolicitada === null ? 1 : 0) ||
  String(a.fechaSolicitada ?? "").localeCompare(String(b.fechaSolicitada ?? "")) ||
  (Number(a.prioridad ?? 999) - Number(b.prioridad ?? 999)) ||
  String(a.of).localeCompare(String(b.of));

// TP o COT sin rematar. Candidatas: OF no finalizadas, de pedidos sin entregar,
// con algún TP o COT. Luego se miran sus tareas (las que no son visita) con el
// mismo criterio de «acabada» que la ficha, y quedan las que tienen algo por
// hacer: la visita, alguna tarea o los bultos. Amarilla = visitas hechas.
async function tpCotSinRematar(pool: sql.ConnectionPool): Promise<FilaLista[]> {
  const tipos = Object.keys(TIPO_AVISO).map((t) => `'${t}'`).join(", ");
  const candidatas = (extra = "") => `
    FROM dbo.CPRManufacturingOrder mo ${extra}
    JOIN dbo.CPRManufacturingOrderSituation sit ON sit.IDManufacturingOrderSituation = mo.IDMOSituation
      AND sit.CodCompany = mo.CodCompany
    ${pedidoDe(true)}
    WHERE mo.CodCompany = '001' AND sit.CodSituation <> '6'
      AND EXISTS (
        SELECT 1 FROM dbo.CPRMOTask t
        JOIN dbo._CPRMOTask_Custom c ON c.IDMOTask = t.IDMOTask
        JOIN dbo.MANMaintenanceWarning w ON w.IDMaintenanceWarning = c.IDMaintenanceWarning
        WHERE t.IDManufacturingOrder = mo.IDManufacturingOrder AND w.IDMaintenanceWarningType IN (${tipos}))`;
  const [ofs, avisos, tareas] = await Promise.all([
    pool.request().query<{
      id: string; of: string; pedido: string; cliente: string | null; prioridad: number | null;
      articulo: string | null; situacion: string | null; fSol: Date | null; cantidad: number; subidas: number | null;
    }>(`
      SELECT mo.IDManufacturingOrder AS id, mo.CodManufacturingOrder AS [of], pedido.pedido, pedido.cliente,
             mo.Priority AS prioridad, CAST(art.Description AS varchar(300)) AS articulo,
             sit.Description AS situacion, pedido.fechaExigida AS fSol, mo.Quantity AS cantidad,
             (SELECT SUM(Quantity) FROM dbo.CPRImputationEntryProduct
               WHERE CodCompany = '001' AND IDManufacturingOrder = mo.IDManufacturingOrder) AS subidas
      ${candidatas("JOIN dbo.STKArticle art ON art.IDArticle = mo.IDArticle")}`),
    pool.request().query<{ id: string; tipo: string; cierre: Date | null }>(`
      SELECT mo.IDManufacturingOrder AS id, w.IDMaintenanceWarningType AS tipo, w.ClosingDate AS cierre
      FROM dbo.CPRMOTask t2
      JOIN dbo._CPRMOTask_Custom c2 ON c2.IDMOTask = t2.IDMOTask
      JOIN dbo.MANMaintenanceWarning w ON w.IDMaintenanceWarning = c2.IDMaintenanceWarning
      JOIN (SELECT mo.IDManufacturingOrder ${candidatas()}) mo ON mo.IDManufacturingOrder = t2.IDManufacturingOrder
      WHERE w.IDMaintenanceWarningType IN (${tipos})`),
    // Las tareas que no son visita y RPS no da por acabadas.
    pool.request().query<{ id: string; of: string; tarea: string }>(`
      SELECT mo.IDManufacturingOrder AS id, mo.CodManufacturingOrder AS [of], t2.CodMOTask AS tarea
      FROM dbo.CPRMOTask t2
      JOIN (SELECT mo.IDManufacturingOrder, mo.CodManufacturingOrder ${candidatas()}) mo
        ON mo.IDManufacturingOrder = t2.IDManufacturingOrder
      LEFT JOIN dbo._CPRMOTask_Custom c2 ON c2.IDMOTask = t2.IDMOTask
      WHERE t2.CodCompany = '001' AND t2.PercentProgress < 100 AND c2.IDMaintenanceWarning IS NULL`),
  ]);
  const acabadas = await finalizadasEnOlanet(pool, tareas.recordset.map((t) => ({ of: t.of.trim(), tarea: t.tarea.trim() })));
  const pendientes = new Map<string, number>();
  for (const t of tareas.recordset) {
    if (acabadas.has(`${t.of.trim()}|${t.tarea.trim()}`)) continue;
    pendientes.set(t.id, (pendientes.get(t.id) ?? 0) + 1);
  }
  const resumen = (id: string, tipo: "TP" | "COT") => {
    const suyos = avisos.recordset.filter((a) => a.id === id && TIPO_AVISO[a.tipo] === tipo);
    if (!suyos.length) return null;
    return suyos.some((a) => !a.cierre) ? `${tipo} pendiente` : `${tipo} hecho`;
  };
  return ofs.recordset
    .map((o) => {
      const tp = resumen(o.id, "TP");
      const cot = resumen(o.id, "COT");
      const visitasHechas = ![tp, cot].some((r) => r?.endsWith("pendiente"));
      const nPendientes = pendientes.get(o.id) ?? 0;
      const cantidad = Number(o.cantidad) || 0;
      const subidas = Number(o.subidas) || 0;
      const bultosOk = subidas > 0 && subidas === cantidad;
      return {
        rematada: visitasHechas && nPendientes === 0 && bultosOk,
        fila: {
          clave: o.id,
          of: o.of.trim(),
          pedido: o.pedido.trim(),
          cliente: texto(o.cliente),
          prioridad: o.prioridad,
          articulo: texto(o.articulo),
          visitas: [tp, cot].filter(Boolean).join(" · "),
          falta: [
            nPendientes ? `${nPendientes} ${nPendientes === 1 ? "tarea" : "tareas"}` : null,
            bultosOk ? null : subidas ? `bultos ${subidas} de ${cantidad}` : "bultos",
          ].filter(Boolean).join(" · ") || "la visita",
          situacion: (o.situacion ?? "").trim(),
          fechaSolicitada: iso(o.fSol),
          amarilla: visitasHechas ? 1 : null,
        } satisfies FilaLista,
      };
    })
    .filter((x) => !x.rematada)
    .map((x) => x.fila)
    .sort(porSolicitadaYPrioridad);
}

// Su Excel «pedidos_sin_of» (12/11/2026), una fila por LÍNEA: pedido AR de
// los últimos 60 días, línea sin OF, sin albarán y pendiente de entregar, que
// no es pedido de almacén, cuya forma de entrega no es la «06» (reparación in
// situ / instalación sin fabricar) y cuyo artículo tiene escandallo
// (CPRStructure: el que lleva fabricación). Dos cambios a propósito: cliente y
// datos de la línea opcionales (que falten no esconde la línea) y una línea
// sin forma de entrega sí sale (su NOT IN la dejaba fuera sin querer).
// Medido el 12/11/2026: 1 ms en RPS.
const SQL_SIN_GESTIONAR = `
    SELECT a.IDOrderLine AS clave, CAST(NULL AS varchar(20)) AS [of], b.CodOrder AS pedido,
           a.NumLine AS linea, c.Description AS cliente,
           LTRIM(STR(a.Quantity, 10, 0)) + ' - ' + CAST(d.Description AS varchar(300)) AS articulo,
           e.TextoRotulacion AS rotulacion, f.DescripcionFormaEntregaPedido AS formaEntrega,
           g.DescripcionPedidoSinCargo AS sinCargo, e.OrderPriority AS prioridad,
           b.OrderDate AS fechaPedido,
           CASE WHEN YEAR(a.ReceptionDemandDate) > 1970 THEN a.ReceptionDemandDate END AS fechaSolicitada
    FROM dbo.FACOrderLineSL a
    JOIN dbo.FACOrderSL b ON b.IDOrder = a.IDOrder
    JOIN dbo.STKArticle d ON d.IDArticle = a.IDArticle
    LEFT JOIN dbo.FACCustomer c ON c.IDCustomer = b.IDCustomer
    LEFT JOIN dbo._FACOrderLineSL_Custom e ON e.IDOrderLine = a.IDOrderLine
    LEFT JOIN dbo._FormaEntregaPedido f ON f.IDFormaEntregaPedido = e.IDFormaEntrega
    LEFT JOIN dbo._TipoPedidoSinCargo g ON g.IDTipoPedidoSinCargo = e.IDTipoPedidoSinCargo
    WHERE a.CodCompany = '001' AND a.IDManufacturingOrder IS NULL AND b.CodOrder LIKE 'AR%'
      AND b.OrderDate >= DATEADD(day, -60, GETDATE())
      AND a.Delivered = 0 AND a.PendingDelivery = 1
      AND ISNULL(e.PedidoAlmacen, 0) = 0
      AND ISNULL(f.CodigoFormaEntregaPedido, '') <> '06'
      AND EXISTS (SELECT 1 FROM dbo.CPRStructure s WHERE s.CodCompany = '001' AND s.IDArticle = d.IDArticle)
    ORDER BY b.CodOrder, a.NumLine`;

// Órdenes exteriores (Cristina, 23/11/2026). OE = tarea de la OF con
// [External] = 1 (palabra reservada: con corchetes). La compra cuelga de la
// TAREA (PUROrderLine.IDMOTask), no solo de la OF. El proveedor bueno es el
// del pedido de compra: el de la tarea es el previsto, y a veces cambia
// (AR.26.05229: Novoneon en la tarea, Modauto en la compra). Sin pedido de
// compra todavía, el de la tarea. Medido el 23/11/2026: 20 OE en OF sin
// finalizar, de 3.833 desde 2023.
// Las compras se leen UNA vez para todas las OE (CTE): buscándolas fila a
// fila con OUTER APPLY, PUROrderLine no tiene índice por IDMOTask y tardaba
// 5,5 s.
// «Recibida» (Cristina, 23/11/2026: cuándo volvió el material) = fecha del
// último albarán del proveedor. PURDeliveryNoteLine tampoco tiene índice por
// IDOrderLine: se cruza una vez con las pocas líneas de compra, no fila a fila.
// Las cantidades van en valor absoluto: Compras a veces mete la línea en
// negativo (AR.26.05523: −1, sin recibir) y saldría «Recibida» con 0 ≥ −1.
const SQL_CON_OE = `
    WITH oe AS (
      SELECT t.IDMOTask, t.IDManufacturingOrder, t.Description, t.IDSupplier, t.CreationTimestamp
      FROM dbo.CPRManufacturingOrder mo
      JOIN dbo.CPRManufacturingOrderSituation sit ON sit.IDManufacturingOrderSituation = mo.IDMOSituation
        AND sit.CodCompany = mo.CodCompany
      JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
      WHERE mo.CodCompany = '001' AND sit.CodSituation <> '6' AND t.CodCompany = '001' AND t.[External] = 1),
    lineas AS (
      SELECT l.IDMOTask, l.IDOrderLine, l.Quantity, l.ReceivedQuantity, l.ReceptionDate, po.OrderDate, prov.Description AS proveedor,
             ROW_NUMBER() OVER (PARTITION BY l.IDMOTask ORDER BY po.OrderDate DESC, l.IDOrderLine DESC) AS n
      FROM dbo.PUROrderLine l
      JOIN oe ON oe.IDMOTask = l.IDMOTask
      JOIN dbo.PUROrder po ON po.IDOrder = l.IDOrder
      LEFT JOIN dbo.PURSupplier prov ON prov.IDSupplier = po.IDSupplier
      WHERE l.CodCompany = '001'),
    albaran AS (
      SELECT dl.IDOrderLine, MAX(dn.DeliveryNoteDate) AS recibidaEl
      FROM lineas
      JOIN dbo.PURDeliveryNoteLine dl ON dl.IDOrderLine = lineas.IDOrderLine
      JOIN dbo.PURDeliveryNote dn ON dn.IDDeliveryNote = dl.IDDeliveryNote
      GROUP BY dl.IDOrderLine),
    compra AS (
      SELECT IDMOTask, SUM(ABS(Quantity)) AS pedida, SUM(ABS(ReceivedQuantity)) AS recibida,
             MIN(OrderDate) AS pedidoProveedor, MAX(ReceptionDate) AS prevista, MAX(albaran.recibidaEl) AS recibidaEl,
             MAX(CASE WHEN n = 1 THEN proveedor END) AS proveedor
      FROM lineas
      LEFT JOIN albaran ON albaran.IDOrderLine = lineas.IDOrderLine
      GROUP BY IDMOTask)
    SELECT oe.IDMOTask AS clave, mo.CodManufacturingOrder AS [of], pedido.pedido, pedido.cliente,
           CAST(oe.Description AS varchar(300)) AS oe,
           COALESCE(compra.proveedor, provTarea.Description) AS proveedor,
           oe.CreationTimestamp AS creada, compra.pedidoProveedor, compra.prevista,
           CASE WHEN compra.recibida >= compra.pedida THEN compra.recibidaEl END AS recibida,
           'OF' AS via,
           CASE
             WHEN compra.IDMOTask IS NULL THEN 'Sin pedir'
             WHEN compra.recibida >= compra.pedida THEN 'Recibida'
             WHEN compra.prevista < CONVERT(date, GETDATE()) THEN 'Retrasada'
             ELSE 'Pendiente'
           END AS estado,
           CASE WHEN compra.recibida >= compra.pedida THEN 1 END AS amarilla
    FROM oe
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = oe.IDManufacturingOrder
    LEFT JOIN compra ON compra.IDMOTask = oe.IDMOTask
    LEFT JOIN dbo.PURSupplier provTarea ON provTarea.IDSupplier = oe.IDSupplier
    ${pedidoDe()}`;

// OE por hoja de almacén (Cristina, 23/11/2026: AR.26.05523 y AR.26.05465).
// Sin OF no hay tarea exterior: Compras pide el artículo al lacador colgando
// la línea de compra de la línea del pedido (PUROrderLine.IDOrderLineSales).
// RPS no marca esas compras como exteriores, y por hoja de almacén también se
// compran toldos hechos, siliconas o tornillería; lo que va a lacar es lo de
// Fresno Metal (todo brazos en color, 111 líneas desde 06/2023). Otro lacador,
// se añade aquí. Solo líneas de pedido sin entregar, como las OF sin finalizar.
const LACADORES_HOJA_ALMACEN = ["FRESNO METAL%"];

const SQL_CON_OE_ALMACEN = `
    WITH lineas AS (
      SELECT l.IDOrderLine, l.IDOrderLineSales, l.Description, l.Quantity, l.ReceivedQuantity, l.ReceptionDate,
             l.CreationTimestamp, po.OrderDate, prov.Description AS proveedor
      FROM dbo.PUROrderLine l
      JOIN dbo.PUROrder po ON po.IDOrder = l.IDOrder
      JOIN dbo.PURSupplier prov ON prov.IDSupplier = po.IDSupplier
      JOIN dbo._FACOrderLineSL_Custom lc ON lc.IDOrderLine = l.IDOrderLineSales AND lc.PedidoAlmacen = 1
      WHERE l.CodCompany = '001' AND l.IDMOTask IS NULL
        AND (${LACADORES_HOJA_ALMACEN.map((p) => `prov.Description LIKE '${p}'`).join(" OR ")})),
    albaran AS (
      SELECT dl.IDOrderLine, MAX(dn.DeliveryNoteDate) AS recibidaEl
      FROM lineas
      JOIN dbo.PURDeliveryNoteLine dl ON dl.IDOrderLine = lineas.IDOrderLine
      JOIN dbo.PURDeliveryNote dn ON dn.IDDeliveryNote = dl.IDDeliveryNote
      GROUP BY dl.IDOrderLine)
    SELECT 'alm-' + CAST(lineas.IDOrderLine AS varchar(50)) AS clave, NULL AS [of],
           ped.CodOrder AS pedido, cli.Description AS cliente,
           CAST(lineas.Description AS varchar(300)) AS oe, lineas.proveedor,
           lineas.CreationTimestamp AS creada, lineas.OrderDate AS pedidoProveedor, lineas.ReceptionDate AS prevista,
           CASE WHEN ABS(lineas.ReceivedQuantity) >= ABS(lineas.Quantity) THEN albaran.recibidaEl END AS recibida,
           'Hoja almacén' AS via,
           CASE
             WHEN ABS(lineas.ReceivedQuantity) >= ABS(lineas.Quantity) THEN 'Recibida'
             WHEN lineas.ReceptionDate < CONVERT(date, GETDATE()) THEN 'Retrasada'
             ELSE 'Pendiente'
           END AS estado,
           CASE WHEN ABS(lineas.ReceivedQuantity) >= ABS(lineas.Quantity) THEN 1 END AS amarilla
    FROM lineas
    JOIN dbo.FACOrderLineSL vl ON vl.IDOrderLine = lineas.IDOrderLineSales
    JOIN dbo.FACOrderSL ped ON ped.IDOrder = vl.IDOrder
    LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = ped.IDCustomer
    LEFT JOIN albaran ON albaran.IDOrderLine = lineas.IDOrderLine
    WHERE vl.CodCompany = '001' AND vl.PendingDelivery = 1 AND ped.CodOrder LIKE 'AR.%'`;

const ORDEN_ESTADO_OE: Record<string, number> = { Retrasada: 0, "Sin pedir": 1, Pendiente: 2, Recibida: 3 };

/** Primero lo que más urge (retrasadas, sin pedir, pendientes, recibidas) y,
 *  dentro, por fecha prevista: sin fecha, al final. */
const porEstadoOE = (a: FilaLista, b: FilaLista) =>
  (ORDEN_ESTADO_OE[String(a.estado)] ?? 9) - (ORDEN_ESTADO_OE[String(b.estado)] ?? 9) ||
  (a.prevista === null ? 1 : 0) - (b.prevista === null ? 1 : 0) ||
  String(a.prevista ?? "").localeCompare(String(b.prevista ?? "")) ||
  String(a.pedido).localeCompare(String(b.pedido));

// Fichajes improductivos (Belén, 14/11/2026): su pantalla de RPS «Imputación
// de tiempos». Solo los de persona (ResourceType 1): cada uno tiene su gemelo
// de máquina (tipo 2) sin empleado. Último año: ~930 filas, 2 s (14/11/2026).
// El pedido, el primero de la OF en cualquier serie; si no tiene, sin pedido.
async function incidencias(pool: sql.ConnectionPool): Promise<FilaLista[]> {
  const r = await pool.request().query<{
      clave: string; of: string; pedido: string | null; codEmpleado: string | null; persona: string | null;
      dia: Date | null; inicio: number | null; fin: number | null; tarea: string; descripcion: string | null; causa: string | null;
    }>(`
      SELECT i.IDImputation AS clave, mo.CodManufacturingOrder AS [of], ped.pedido,
             e.CodEmployee AS codEmpleado, e.Description AS persona, i.ImputationDate AS dia,
             i.StartHour AS inicio, i.EndHour AS fin, t.CodMOTask AS tarea,
             CAST(t.Description AS varchar(300)) AS descripcion, u.Description AS causa
      FROM dbo.CPRImputationMO i
      JOIN dbo.CPRMOTask t ON t.IDMOTask = i.IDMOTask
      JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = i.IDManufacturingOrder
      LEFT JOIN dbo.CPRUnproductiveType u ON u.IDUnproductiveType = i.IDUnproductiveType
      LEFT JOIN dbo.GENEmployee e ON e.IDEmployee = i.IDEmployeeMachineTool
      OUTER APPLY (
        SELECT TOP (1) p.CodOrder AS pedido
        FROM dbo.FACOrderLineSL lin
        JOIN dbo.FACOrderSL p ON p.IDOrder = lin.IDOrder
        WHERE lin.IDManufacturingOrder = mo.IDManufacturingOrder AND lin.CodCompany = '001'
        ORDER BY p.CodOrder, lin.NumLine
      ) ped
      WHERE i.CodCompany = '001' AND i.Unproductive = 1 AND i.ResourceType = 1
        AND i.ImputationDate >= DATEADD(year, -1, CONVERT(date, GETDATE()))
      ORDER BY i.ImputationDate DESC, i.StartHour DESC, mo.CodManufacturingOrder`);
  return r.recordset.map((f) => {
    const cod = (f.codEmpleado ?? "").trim();
    return {
      clave: String(f.clave).trim(),
      of: f.of.trim(),
      pedido: texto(f.pedido),
      dia: iso(f.dia),
      empleado: cod ? `${cod} · ${nombreHistorial(f.persona)}` : null,
      inicio: horaDeSegundos(f.inicio),
      fin: horaDeSegundos(f.fin),
      tarea: `${f.tarea.trim()} ${(f.descripcion ?? "").trim()}`.trim(),
      improductivo: "Sí",
      causa: texto(f.causa),
    };
  });
}

// ─── Tiempos abiertos en OLANET (Belén, 17/11/2026) ──────────────────────────
// Quien sigue fichando con más de 9 h 20 min en la misma tarea, o con el
// fichaje abierto a las 23:30 (se fue sin cerrarlo). Sale de la foto de quién
// ficha AHORA (tgm_fichajes_olanet: `tiempo` = minutos del tramo abierto), así
// que el inicio es la hora de la foto menos lo que lleva. Las horas se sacan
// en SQL, en la hora del servidor, para no pasar por la zona horaria de node.
// Dónde, por la máquina: S- Santiago, B- Bergondo y el resto Arzúa (A- y las
// P- de Arzúa). La orden «1» es la de indirectas (OF 0000001).
/** 9 h 20 min. */
export const MINUTOS_TIEMPO_ABIERTO = 9 * 60 + 20;

export function delegacionDeMaquina(maquina: string | null): string {
  const m = (maquina ?? "").trim().toUpperCase();
  return m.startsWith("S-") ? "Santiago" : m.startsWith("B-") ? "Bergondo" : "Arzúa";
}

/** Minutos → «9:45», con la hora a dos cifras para que ordene bien como texto. */
export const horasMinutos = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Días hacia atrás de los fichajes ya cerrados (los de RPS). */
export const DIAS_TIEMPOS_CERRADOS = 7;

/** 23:30 en segundos desde la medianoche, y lo que RPS usa de fin de día al
 *  partir un fichaje en la medianoche (24:00, con algún segundo de menos). */
const SEG_23_30 = 23 * 3600 + 30 * 60;
const SEG_FIN_DIA = 86340;

const motivoTiempo = (minutos: number, nocturno: boolean) =>
  [minutos >= MINUTOS_TIEMPO_ABIERTO && "Más de 9 h 20", nocturno && "Pasadas las 23:30"].filter(Boolean).join(" · ");

/** «02 MONTAR · S-MONT»: la máquina va con la tarea (la tabla no tiene sitio
 *  para otra columna). */
const conMaquina = (tarea: string, maquina: string | null) =>
  [tarea.trim(), (maquina ?? "").trim()].filter(Boolean).join(" · ");

const empleadoTiempo = (cod: string | null, persona: string | null) =>
  cod ? `${cod} · ${persona ? nombreHistorial(persona) : "?"}` : null;

/** Los que siguen abiertos AHORA, de la foto de OLANET. */
async function tiemposAbiertosAhora(pool: sql.ConnectionPool): Promise<FilaLista[]> {
  const r = await pool.request().input("minutos", sql.Int, MINUTOS_TIEMPO_ABIERTO).query<{
    clave: string; orden: string; fase: string; tiempo: number; maquina: string | null; dia: string; hora: string;
    nocturno: number; of: string | null; pedido: string | null; tarea: string | null; codEmpleado: string | null;
    persona: string | null; codoperario: number | null;
  }>(`
    WITH f AS (
      SELECT f.*, DATEADD(minute, -f.tiempo, f.CreationTimestamp) AS inicio,
             -- Las 23:30 más recientes antes de la foto: si empezó antes, sigue abierto desde entonces.
             CASE WHEN CAST(f.CreationTimestamp AS time) >= '23:30'
                  THEN DATEADD(minute, 1410, CAST(CAST(f.CreationTimestamp AS date) AS datetime))
                  ELSE DATEADD(minute, -30, CAST(CAST(f.CreationTimestamp AS date) AS datetime)) END AS corte
      FROM dbo.tgm_fichajes_olanet f
    )
    SELECT CAST(f.ID_fichaje AS varchar(40)) AS clave, f.orden, f.fase, f.tiempo, f.maquina, f.codoperario,
           CONVERT(varchar(10), f.inicio, 23) AS dia, CONVERT(varchar(5), f.inicio, 108) AS hora,
           CASE WHEN f.inicio <= f.corte THEN 1 ELSE 0 END AS nocturno,
           mo.CodManufacturingOrder AS [of], ped.pedido, CAST(t.Description AS varchar(300)) AS tarea,
           emp.CodEmployee AS codEmpleado, emp.Description AS persona
    FROM f
    LEFT JOIN dbo.CPRManufacturingOrder mo ON mo.CodCompany = '001'
      AND mo.CodManufacturingOrder = RIGHT('0000000' + LTRIM(RTRIM(f.orden)), 7)
    -- Exacto: «2» y «02» son tareas distintas de la misma OF.
    LEFT JOIN dbo.CPRMOTask t ON t.CodCompany = '001' AND t.IDManufacturingOrder = mo.IDManufacturingOrder
      AND t.CodMOTask = LTRIM(RTRIM(f.fase))
    OUTER APPLY (
      SELECT TOP (1) p.CodOrder AS pedido
      FROM dbo.FACOrderLineSL lin JOIN dbo.FACOrderSL p ON p.IDOrder = lin.IDOrder
      WHERE lin.IDManufacturingOrder = mo.IDManufacturingOrder AND lin.CodCompany = '001'
      ORDER BY p.CodOrder, lin.NumLine
    ) ped
    LEFT JOIN dbo.GENEmployee emp ON emp.CodCompany = '001' AND emp.CodEmployee = CAST(f.codoperario AS varchar(20))
    WHERE f.tiempo >= @minutos OR f.inicio <= f.corte
    ORDER BY f.tiempo DESC`);
  return r.recordset.map((f) => {
    const cod = (f.codEmpleado ?? "").trim() || (f.codoperario != null ? String(f.codoperario) : "");
    const indirecta = f.orden.trim() === "1";
    const fase = f.fase.trim();
    return {
      clave: f.clave,
      estado: "Abierto",
      of: indirecta ? null : (texto(f.of) ?? f.orden.trim()),
      pedido: texto(f.pedido),
      delegacion: delegacionDeMaquina(f.maquina),
      dia: f.dia,
      horario: `${f.hora} → sigue`,
      tiempo: horasMinutos(f.tiempo),
      empleado: empleadoTiempo(cod, f.persona),
      maquina: texto(f.maquina),
      tarea: conMaquina(`${indirecta ? "Indirecta " : ""}${fase} ${(f.tarea ?? "").trim()}`, f.maquina),
      motivo: motivoTiempo(f.tiempo, f.nocturno === 1),
    };
  });
}

/** Los ya cerrados de la última semana, de RPS: lo que ya metieron en la OF.
 *  Un fichaje que pasa la medianoche llega partido en dos (hasta las 24:00 y
 *  desde las 0:00 del día siguiente): se cosen y sale una fila con el tiempo
 *  entero. Solo personas (ResourceType 1); la máquina va en IDMachine
 *  («001-s-conf»). */
async function tiemposCerrados(pool: sql.ConnectionPool): Promise<FilaLista[]> {
  const r = await pool
    .request()
    .input("dias", sql.Int, DIAS_TIEMPOS_CERRADOS)
    .input("minutos", sql.Int, MINUTOS_TIEMPO_ABIERTO)
    .input("noche", sql.Int, SEG_23_30)
    .input("finDia", sql.Int, SEG_FIN_DIA)
    .query<{
      clave: string; dia: string; inicio: string; hasta: string; diaFin: string; segundos: number; nocturno: number;
      maquina: string | null; of: string | null; pedido: string | null; codTarea: string | null; tarea: string | null;
      codEmpleado: string | null; persona: string | null;
    }>(`
    WITH i AS (
      SELECT i.IDImputation, i.IDManufacturingOrder, i.IDMOTask, i.IDEmployeeMachineTool AS emp, i.IDMachine,
             i.ImputationDate AS d, i.StartHour AS s, i.EndHour AS e
      FROM dbo.CPRImputationMO i
      WHERE i.CodCompany = '001' AND i.ResourceType = 1
        AND i.ImputationDate >= DATEADD(day, -@dias, CAST(GETDATE() AS date))
        AND i.StartHour IS NOT NULL AND i.EndHour IS NOT NULL
    ),
    tramo AS (
      SELECT a.*, sig.e AS e2, sig.d AS d2
      FROM i a
      -- Su continuación del día siguiente, si la hay.
      OUTER APPLY (
        SELECT TOP (1) b.e, b.d FROM i b
        WHERE a.e >= @finDia AND b.emp = a.emp AND b.IDMOTask = a.IDMOTask
          AND b.d = DATEADD(day, 1, a.d) AND b.s = 0
      ) sig
      -- La continuación sola no sale: ya va cosida a su primer trozo.
      WHERE NOT (a.s = 0 AND EXISTS (
        SELECT 1 FROM i p WHERE p.emp = a.emp AND p.IDMOTask = a.IDMOTask
          AND p.d = DATEADD(day, -1, a.d) AND p.e >= @finDia))
    ),
    t2 AS (
      SELECT *, (e - s) + ISNULL(e2, 0) AS segundos,
             CASE WHEN e > @noche THEN 1 ELSE 0 END AS nocturno
      FROM tramo
    )
    SELECT CAST(t2.IDImputation AS varchar(40)) AS clave,
           CONVERT(varchar(10), t2.d, 23) AS dia,
           CONVERT(varchar(5), DATEADD(second, t2.s, 0), 108) AS inicio,
           CONVERT(varchar(5), DATEADD(second, ISNULL(t2.e2, t2.e), 0), 108) AS hasta,
           CONVERT(varchar(10), ISNULL(t2.d2, t2.d), 23) AS diaFin,
           t2.segundos, t2.nocturno,
           UPPER(CASE WHEN t2.IDMachine LIKE '001-%' THEN SUBSTRING(t2.IDMachine, 5, 50) ELSE t2.IDMachine END) AS maquina,
           mo.CodManufacturingOrder AS [of], ped.pedido, t.CodMOTask AS codTarea, CAST(t.Description AS varchar(300)) AS tarea,
           emp.CodEmployee AS codEmpleado, emp.Description AS persona
    FROM t2
    LEFT JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = t2.IDManufacturingOrder
    LEFT JOIN dbo.CPRMOTask t ON t.IDMOTask = t2.IDMOTask
    OUTER APPLY (
      SELECT TOP (1) p.CodOrder AS pedido
      FROM dbo.FACOrderLineSL lin JOIN dbo.FACOrderSL p ON p.IDOrder = lin.IDOrder
      WHERE lin.IDManufacturingOrder = t2.IDManufacturingOrder AND lin.CodCompany = '001'
      ORDER BY p.CodOrder, lin.NumLine
    ) ped
    LEFT JOIN dbo.GENEmployee emp ON emp.IDEmployee = t2.emp
    WHERE t2.segundos >= @minutos * 60 OR t2.nocturno = 1
    ORDER BY t2.d DESC, t2.s DESC`);
  return r.recordset.map((f) => {
    const minutos = Math.round(f.segundos / 60);
    const indirecta = (f.of ?? "").trim() === "0000001";
    return {
      clave: `rps-${f.clave}`,
      estado: "Cerrado",
      of: indirecta ? null : texto(f.of),
      pedido: texto(f.pedido),
      delegacion: delegacionDeMaquina(f.maquina),
      dia: f.dia,
      // Si acabó otro día, se dice: «11:55 → 07:05 (13/11)».
      horario: `${f.inicio} → ${f.hasta}${f.diaFin !== f.dia ? ` (${f.diaFin.slice(8, 10)}/${f.diaFin.slice(5, 7)})` : ""}`,
      tiempo: horasMinutos(minutos),
      empleado: empleadoTiempo(texto(f.codEmpleado), f.persona),
      maquina: texto(f.maquina),
      tarea: conMaquina(`${indirecta ? "Indirecta " : ""}${(f.codTarea ?? "").trim()} ${(f.tarea ?? "").trim()}`, f.maquina),
      motivo: motivoTiempo(minutos, f.nocturno === 1),
    };
  });
}

/** Primero los que siguen abiertos (hay que avisar ya); luego los cerrados. */
async function tiemposAbiertos(pool: sql.ConnectionPool): Promise<FilaLista[]> {
  const [ahora, cerrados] = await Promise.all([tiemposAbiertosAhora(pool), tiemposCerrados(pool)]);
  return [...ahora, ...cerrados];
}

// Diferencias con los Excels, a propósito (09/11/2026): una fila por OF y no
// por tarea o máquina (sus joins repetían la OF y podían inflar unidades);
// cliente y forma de entrega opcionales, para que su falta no esconda un aviso;
// cada lista conserva la situación de OF que filtraba su Excel.

// ─── El registro ─────────────────────────────────────────────────────────────

export const CONSULTAS: Record<IdLista, (pool: sql.ConnectionPool) => Promise<FilaLista[]>> = {
  "bultos-subidos": (pool) => tareasPendientes(pool),
  "finalizadas-bultos": (pool) => finalizadasBultosPendientes(pool),
  "desfase": (pool) => comprobacion(pool, SQL_DESFASE),
  "fechas-comprometidas": (pool) => fechasComprometidas(pool),
  "varias-maquinas": (pool) => comprobacion(pool, SQL_VARIAS_MAQUINAS),
  "sin-descripcion": (pool) => comprobacion(pool, SQL_SIN_DESCRIPCION),
  "sin-tiempos": (pool) => sinTiempos(pool),
  "tareas-horas": (pool) => tareasEnHoras(pool),
  "tiempos-sin-subir": (pool) => comprobacion(pool, SQL_TIEMPOS_SIN_SUBIR),
  "delimitacion": (pool) => comprobacion(pool, SQL_DELIMITACION),
  "detenidas-material": (pool) => comprobacion(pool, SQL_DETENIDAS_MATERIAL),
  "compras-pendientes": async (pool) => (await comprobacion(pool, SQL_COMPRAS_PENDIENTES)).sort(porSolicitadaYPrioridad),
  "tp-cot": (pool) => tpCotSinRematar(pool),
  "sin-gestionar": (pool) => comprobacion(pool, SQL_SIN_GESTIONAR),
  "con-oe": async (pool) => {
    const [porOF, porAlmacen] = await Promise.all([comprobacion(pool, SQL_CON_OE), comprobacion(pool, SQL_CON_OE_ALMACEN)]);
    return [...porOF, ...porAlmacen].sort(porEstadoOE);
  },
  "incidencias": (pool) => incidencias(pool),
  "tiempos-abiertos": (pool) => tiemposAbiertos(pool),
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
export async function leerListaBelen(id: IdLista, { forzar = false } = {}): Promise<{ filas: FilaLista[]; calculadaAt: string }> {
  const ahora = Date.now();
  let g = cache.get(id);
  if (!g) {
    g = { at: 0, filas: null, enCurso: null };
    cache.set(id, g);
  }
  const edad = ahora - g.at;
  // «Actualizar» a mano: se recalcula de verdad, aunque lo guardado sea de
  // hace un momento (si ya hay una en marcha, se espera a esa).
  if (g.filas && edad < CADUCA_MS && !forzar) {
    // Lo que hay, ya; y si está pasada, se renueva para la próxima. El error
    // de esa renovación no le llega a nadie: se reintenta en la siguiente.
    if (edad >= FRESCA_MS) recalcular(id, g).catch(() => {});
    return { filas: g.filas, calculadaAt: new Date(g.at).toISOString() };
  }
  const filas = await recalcular(id, g);
  return { filas, calculadaAt: new Date(g.at).toISOString() };
}
