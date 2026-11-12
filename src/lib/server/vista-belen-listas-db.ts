import sql from "mssql";
import { getPool } from "./db";
import { fechaDeTexto, unaFilaPorTarea } from "../vista-belen";
import type { FilaLista, IdLista } from "../vista-belen-listas";
import { ES_RPS, FEATURE_COMPROMETIDA, iso, texto, TIPO_AVISO } from "./rps-belen-comun";

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
async function tareasConTiempo(pool: sql.ConnectionPool, condicion: string, situaciones: string): Promise<Array<FilaLista & { minutos: number }>> {
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
    ${pedidoDe()}
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

// Sus hojas «Tareas tiempo 0» (situaciones 1-5) y «Tareas 8 horas» (el Excel
// buscaba EXACTAMENTE 480 min, que es lo que se pone por defecto; Belén pide
// «más de 8 horas»: aquí, 8 h o más). Las situaciones, las de OF en marcha.
async function tiemposPrevistos(pool: sql.ConnectionPool): Promise<FilaLista[]> {
  const filas = await tareasConTiempo(
    pool,
    `(task.ExecutionTime = 0 OR ${MINUTOS_TAREA("task")} >= 480)`,
    "sit.CodSituation IN ('1', '2', '3', '4', '5')",
  );
  return filas.map(({ minutos, ...f }) => ({ ...f, problema: minutos === 0 ? "Sin tiempo" : "8 h o más" }));
}

// La hoja «Tareas» de «carga_por_maquina_datos_planificador», que Belén filtra
// por máquina A- y unidad «horas». Su consulta toma toda OF no finalizada.
async function maquinaAEnHoras(pool: sql.ConnectionPool): Promise<FilaLista[]> {
  // Arzúa = máquinas «A-…» y grupos «…-A» (OTEC-A, ROTU-A, DGRA-A).
  const filas = await tareasConTiempo(
    pool,
    "task.TimeUnit = 2 AND (rm.CodMOResourceMachine LIKE 'A-%' OR rm.CodMOResourceMachine LIKE '%-A')",
    "sit.CodSituation <> '6'",
  );
  // Los minutos solo sirven para separar el problema en la otra lista.
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

// Delimitación «no empezar antes de» (tipo 7) con la tarea planificada para
// empezar antes; y la de «empezar el» (tipo 6) en otro día, que es lo que
// miraba su Excel. Medido el 12/11/2026: 40 de las 190 de tipo 7, todas AR o no.
const SQL_DELIMITACION = `
    SELECT task.IDMOTask AS clave, mo.CodManufacturingOrder AS [of], pedido.pedido, pedido.cliente,
           mo.Priority AS prioridad, task.CodMOTask + ' ' + CAST(task.Description AS varchar(300)) AS tarea,
           STUFF((SELECT DISTINCT ', ' + LTRIM(RTRIM(rm.CodMOResourceMachine)) FROM dbo.CPRMOResourceMachine rm
             WHERE rm.IDMOTask = task.IDMOTask FOR XML PATH(''), TYPE).value('.', 'varchar(max)'), 1, 2, '') AS maquina,
           task.DelimitationDate AS fechaDelimitacion, task.PlannedStartDate AS fechaPlanificada,
           sit.Description AS situacion
    FROM dbo.CPRMOTask task
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = task.IDManufacturingOrder
    JOIN dbo.CPRManufacturingOrderSituation sit ON sit.IDManufacturingOrderSituation = mo.IDMOSituation
      AND sit.CodCompany = mo.CodCompany
    JOIN dbo.STKArticle art ON art.IDArticle = mo.IDArticle
    ${pedidoDe()}
    WHERE task.CodCompany = '001' AND sit.CodSituation IN ('0', '1', '2', '3', '4', '5')
      AND task.PercentProgress < 100 AND art.CodArticle <> 'diseño' AND task.DelimitationDate IS NOT NULL
      AND ((task.DelimitationType = 7 AND CONVERT(date, task.PlannedStartDate) < CONVERT(date, task.DelimitationDate))
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
  "tiempos-previstos": (pool) => tiemposPrevistos(pool),
  "maquina-a-horas": (pool) => maquinaAEnHoras(pool),
  "tiempos-sin-subir": (pool) => comprobacion(pool, SQL_TIEMPOS_SIN_SUBIR),
  "delimitacion": (pool) => comprobacion(pool, SQL_DELIMITACION),
  "detenidas-material": (pool) => comprobacion(pool, SQL_DETENIDAS_MATERIAL),
  "compras-pendientes": async (pool) => (await comprobacion(pool, SQL_COMPRAS_PENDIENTES)).sort(porSolicitadaYPrioridad),
  "tp-cot": (pool) => tpCotSinRematar(pool),
  "sin-gestionar": (pool) => comprobacion(pool, SQL_SIN_GESTIONAR),
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
