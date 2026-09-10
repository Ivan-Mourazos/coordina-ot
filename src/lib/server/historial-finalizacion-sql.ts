import { recursosSql, SECCIONES, type SeccionId } from "../secciones";

/** La existencia de UNA fase terminada no finaliza el pedido. Se comprueban
 *  todas las tareas de la sección, o todas las tareas si no hay de esa sección.
 *  El filtro de búsqueda ya viene parametrizado por construirFiltros. */
export function ctesFinalizacionHistorial(seccion: SeccionId, busqueda?: string): string {
  const recursos = recursosSql(SECCIONES[seccion]);
  // En RPS el primer fichaje puede poner PercentProgress=100. Fuera del
  // rescate histórico de OT exigimos el cierre de fase, no ese porcentaje.
  // Los pedidos vivos de CoordinaOT se excluyen antes, incluso aprobados.
  const rescateOt = seccion === "ot"
    ? "r.IDMOTask IS NOT NULL AND COALESCE(t.Description,'') NOT LIKE 'PLANTEAR EN TALLER%' AND t.PercentProgress >= 100"
    : "1=0";
  return `
    IF OBJECT_ID('tempdb..#CoordinaHistorialPedidos') IS NOT NULL DROP TABLE #CoordinaHistorialPedidos;
    IF OBJECT_ID('tempdb..#CoordinaHistorialOrdenes') IS NOT NULL DROP TABLE #CoordinaHistorialOrdenes;
    IF OBJECT_ID('tempdb..#CoordinaHistorialPendientes') IS NOT NULL DROP TABLE #CoordinaHistorialPendientes;
    IF OBJECT_ID('tempdb..#CoordinaHistorialFinalizados') IS NOT NULL DROP TABLE #CoordinaHistorialFinalizados;
    SELECT p.n.value('.', 'nvarchar(25)') AS pedido INTO #CoordinaHistorialPendientes
      FROM (SELECT CAST(@pendientes AS xml) AS lista) x CROSS APPLY x.lista.nodes('/pedidos/p') p(n);
    CREATE INDEX IX_CoordinaHistorialPendientes ON #CoordinaHistorialPendientes(pedido);
      ${busqueda ? `SELECT o.IDOrder, o.CodOrder, o.OrderDate, o.IDCustomer, o.IDCustomerDeliveryAddress
      INTO #CoordinaHistorialPedidos
      FROM dbo.FACOrderSL o
      ${busqueda ? "LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer=o.IDCustomer" : ""}
      WHERE o.CodCompany='001'
        AND NOT EXISTS (SELECT 1 FROM #CoordinaHistorialPendientes pendiente WHERE pendiente.pedido=o.CodOrder)
        ${busqueda ? `AND ${busqueda.replaceAll("p.pedido", "o.CodOrder")}` : ""};
    CREATE UNIQUE CLUSTERED INDEX IX_CoordinaHistorialPedidos ON #CoordinaHistorialPedidos(IDOrder);
    SELECT DISTINCT l.IDManufacturingOrder INTO #CoordinaHistorialOrdenes
      FROM #CoordinaHistorialPedidos o JOIN dbo.FACOrderLineSL l ON l.IDOrder=o.IDOrder
      WHERE l.IDManufacturingOrder IS NOT NULL;
    CREATE UNIQUE CLUSTERED INDEX IX_CoordinaHistorialOrdenes ON #CoordinaHistorialOrdenes(IDManufacturingOrder);` : ""}
    ;WITH Recursos AS (
      SELECT DISTINCT IDMOTask FROM dbo.CPRMOResourceMachine
      WHERE CodMOResourceMachine IN (${recursos})
    ), FinFase AS (
      SELECT orden, fase, MAX(fecha_cambio) AS fin
      FROM dbo.tgm_estadosof_olanet WHERE idestadoof=3 GROUP BY orden, fase
    ), Tareas AS (
      SELECT mo.IDManufacturingOrder,
        CASE WHEN r.IDMOTask IS NOT NULL
          AND COALESCE(t.Description,'') NOT LIKE 'PLANTEAR EN TALLER%'
          THEN 1 ELSE 0 END AS de_seccion,
        CASE WHEN e.fin IS NOT NULL OR (${rescateOt}) THEN 1 ELSE 0 END AS terminada,
        COALESCE(e.fin, CASE WHEN ${rescateOt}
          AND t.RealEndDate > '2000-01-01' AND t.RealEndDate < DATEADD(day,1,GETDATE())
          THEN t.RealEndDate END) AS fin
      FROM dbo.CPRManufacturingOrder mo
      ${busqueda ? "JOIN #CoordinaHistorialOrdenes candidatas ON candidatas.IDManufacturingOrder=mo.IDManufacturingOrder" : ""}
      LEFT JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder=mo.IDManufacturingOrder
      LEFT JOIN Recursos r ON r.IDMOTask=t.IDMOTask
      LEFT JOIN FinFase e ON e.orden=mo.CodManufacturingOrder AND e.fase=t.CodMOTask
      WHERE mo.CodCompany='001'
    ), ResumenOF AS (
      SELECT IDManufacturingOrder, MAX(de_seccion) AS tiene_seccion,
        MAX(CASE WHEN de_seccion=1 THEN 1-terminada ELSE 0 END) AS pendiente_seccion,
        MAX(1-terminada) AS pendiente_total,
        MAX(CASE WHEN de_seccion=1 THEN fin END) AS fin_seccion, MAX(fin) AS fin_total
      FROM Tareas GROUP BY IDManufacturingOrder
    ), ResumenPedido AS (
      SELECT o.CodOrder AS pedido, MAX(o.OrderDate) AS fecha_pedido,
        COUNT(DISTINCT t.IDManufacturingOrder) AS n_of,
        MAX(t.tiene_seccion) AS tiene_seccion,
        MAX(t.pendiente_seccion) AS pendiente_seccion,
        MAX(t.pendiente_total) AS pendiente_total,
        MAX(t.fin_seccion) AS fin_seccion, MAX(t.fin_total) AS fin_total
      FROM ${busqueda ? "#CoordinaHistorialPedidos" : "dbo.FACOrderSL"} o
      JOIN dbo.FACOrderLineSL l ON l.IDOrder=o.IDOrder
      JOIN ResumenOF t ON t.IDManufacturingOrder=l.IDManufacturingOrder
      ${busqueda ? "" : "WHERE o.CodCompany='001' AND NOT EXISTS (SELECT 1 FROM #CoordinaHistorialPendientes pendiente WHERE pendiente.pedido=o.CodOrder)"}
      GROUP BY o.CodOrder
    ), PedFin AS (
      SELECT pedido, fecha_pedido, n_of, tiene_seccion, pendiente_seccion, pendiente_total,
        CASE WHEN tiene_seccion=1 THEN fin_seccion ELSE fin_total END AS finalizada
      FROM ResumenPedido
    )
    SELECT * INTO #CoordinaHistorialFinalizados FROM PedFin;
    ;WITH PedFin AS (SELECT * FROM #CoordinaHistorialFinalizados)`;
}
