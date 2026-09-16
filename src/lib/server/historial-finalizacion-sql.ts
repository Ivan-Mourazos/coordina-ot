import { recursosSql, SECCIONES, type SeccionId } from "../secciones";

/** La existencia de UNA fase terminada no finaliza el pedido. Se comprueban
 *  todas las tareas de la sección, o todas las tareas si no hay de esa sección.
 *  El filtro de búsqueda ya viene parametrizado por construirFiltros. */
export function ctesFinalizacionHistorial(seccion: SeccionId, busqueda?: string): string {
  const recursos = recursosSql(SECCIONES[seccion]);
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
    ), Centros AS (
      -- Cualquier centro de trabajo, no solo los de esta sección: es la marca
      -- de que la tarea es trabajo de verdad y no una pseudo-tarea de RPS.
      -- "0 · Materiales" (187 en 2026, ninguna llega jamás al 100 %), notas
      -- sueltas tecleadas como tarea ("99 · 03/09 VISITA PARA DURO CON
      -- JUSTA", 124 en 2026) y trabajo que se manda fuera (LACAR, CINCAR,
      -- APLICAR VINILO, 35 abiertas) no cuelgan de ningún centro, y NINGUNA
      -- de las tres cierra jamás en OLANET (0 de todas las de 2026): sin este
      -- filtro dejaban el pedido pendiente para siempre. Medido el
      -- 14/09/2026 contra RPS: 151 de 551 pedidos pendientes desde junio no
      -- tenían ni un centro que enseñar.
      SELECT DISTINCT IDMOTask FROM dbo.CPRMOResourceMachine
    ), Finalizacion AS (
      -- Tareas del centro de Finalización. Por el CENTRO entran EMPAQUETAR y
      -- PONER A MEDIDA Y EMBALAR, que no dicen «finalizar» (ver es_fin).
      SELECT DISTINCT IDMOTask FROM dbo.CPRMOResourceMachine
      WHERE UPPER(COALESCE(Description,'')) LIKE '%FINALIZ%'
    ), Albaranes AS (
      -- Solo para la lista ENTERA (ver ResumenPedido): agrupar los 2,3 M de
      -- líneas de albarán una vez y cruzarlas por hash cuesta segundos;
      -- preguntando línea a línea con OUTER APPLY, la lista pasó de 35 s a
      -- 97 s (medido el 15/09/2026). Con búsqueda son cuatro líneas y manda
      -- la cuenta contraria, así que ahí se usa el APPLY.
      SELECT dl.IDOrderLine, MAX(d.DeliveryNoteDate) AS fecha
      FROM dbo.FACDeliveryNoteLineSL dl
      JOIN dbo.FACDeliveryNoteSL d ON d.IDDeliveryNote = dl.IDDeliveryNote
      GROUP BY dl.IDOrderLine
    ), FinFase AS (
      SELECT orden, fase, MAX(fecha_cambio) AS fin
      FROM dbo.tgm_estadosof_olanet WHERE idestadoof=3 GROUP BY orden, fase
    ), Tareas AS (
      SELECT mo.IDManufacturingOrder,
        CASE WHEN r.IDMOTask IS NOT NULL
          AND COALESCE(t.Description,'') NOT LIKE 'PLANTEAR EN TALLER%'
          THEN 1 ELSE 0 END AS de_seccion,
        CASE WHEN c.IDMOTask IS NOT NULL THEN 1 ELSE 0 END AS tiene_centro,
        -- FINALIZAR manda (Iván, 15/09/2026): cerrada, la OF está rematada
        -- en fábrica aunque quede algo de antes abierto por olvido.
        CASE WHEN fz.IDMOTask IS NOT NULL
          OR UPPER(COALESCE(t.Description,'')) LIKE '%FINALIZ%' THEN 1 ELSE 0 END AS es_fin,
        -- TERMINADA: el cierre de fase en OLANET, o lo que diga RPS.
        --
        -- OLANET sincroniza con RPS, pero RPS no sincroniza con OLANET: cuando
        -- Producción cierra a mano una fase que alguien dejó sin finalizar, o
        -- anula trabajo que al final no se hace, eso se escribe SOLO en RPS y
        -- tgm_estadosof_olanet no se entera nunca. Mirando solo OLANET, esas
        -- tareas quedaban abiertas para siempre: de 3.641 pedidos entregados
        -- entre 2023 y 2026 con "tareas sin finalizar", 3.607 ya estaban
        -- cerrados en RPS y solo 34 seguían abiertos de verdad (16/09/2026).
        --
        -- Las señales, medidas sobre las 122.089 tareas con centro desde 2023:
        --  · RealEndDate: la fecha de fin real. Nunca aparece sin que la tarea
        --    esté al 100 %, y recoge lo mismo que el viejo rescate por
        --    porcentaje (297 tareas de OT frente a 298) sin sus falsos: hay
        --    20.804 tareas al 100 % que NO han cerrado, porque el primer
        --    fichaje ya pone el porcentaje.
        --  · FINALIZADA (situación 6): la OF entera rematada en RPS. Rescata
        --    otras 112 de OT, 52 de Diseño y 1.324 de taller.
        --
        -- DETENIDA (situación 7) NO entra, aunque nadie esté trabajando en
        -- ella: es la misma señal con la que el tablero marca una OF como
        -- detenida (ver el campo detenida en rps.ts), así que darla por terminada
        -- aquí diría lo contrario de lo que el equipo tiene delante. Parada
        -- no es acabada: alguien tiene que resolverla.
        CASE WHEN e.fin IS NOT NULL OR sit.CodSituation = '6'
          OR (t.RealEndDate > '2000-01-01' AND t.RealEndDate < DATEADD(day,1,GETDATE()))
          THEN 1 ELSE 0 END AS terminada,
        COALESCE(e.fin, CASE WHEN t.RealEndDate > '2000-01-01'
          AND t.RealEndDate < DATEADD(day,1,GETDATE()) THEN t.RealEndDate END) AS fin
      FROM dbo.CPRManufacturingOrder mo
      ${busqueda ? "JOIN #CoordinaHistorialOrdenes candidatas ON candidatas.IDManufacturingOrder=mo.IDManufacturingOrder" : ""}
      LEFT JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder=mo.IDManufacturingOrder
      LEFT JOIN Recursos r ON r.IDMOTask=t.IDMOTask
      LEFT JOIN Centros c ON c.IDMOTask=t.IDMOTask
      LEFT JOIN Finalizacion fz ON fz.IDMOTask=t.IDMOTask
      LEFT JOIN FinFase e ON e.orden=mo.CodManufacturingOrder AND e.fase=t.CodMOTask
      -- Por CodSituation y no por IDMOSituation: el id es de la empresa
      -- ("001-36") y el código es el de RPS, el mismo en cualquier compañía.
      LEFT JOIN dbo.CPRManufacturingOrderSituation sit
        ON sit.IDManufacturingOrderSituation=mo.IDMOSituation
      WHERE mo.CodCompany='001'
    ), ResumenOF AS (
      SELECT IDManufacturingOrder, MAX(de_seccion) AS tiene_seccion,
        MAX(CASE WHEN de_seccion=1 THEN 1-terminada ELSE 0 END) AS pendiente_seccion,
        -- Solo cuenta para "pendiente" el trabajo que cuelga de un centro
        -- (ver Centros arriba). Dos motivos: (1) sin centro la fila no puede
        -- decir por dónde va el pedido, que es justo lo que esta pantalla
        -- contesta; (2) separar una nota de un trabajo por el texto es
        -- adivinar ("19/8 - SACAR PIÑON A BRAZOS" es trabajo y "17/8 -
        -- VISITA DE JAIME CON PITA" es una nota, y están escritas igual), y
        -- enseñar ese texto al invitado sacaría notas internas fuera de
        -- casa. Lo que se manda a lacar no se pierde: mientras no salga, el
        -- pedido sigue pendiente por la entrega (pendiente_entrega).
        -- pendiente_seccion y tiene_seccion NO cambian: ya miran solo tareas
        -- de la sección, que siempre tienen centro (Recursos ⊆ Centros).
        MAX(CASE WHEN tiene_centro=1 THEN 1-terminada ELSE 0 END) AS pendiente_total,
        -- Si le queda trabajo, para la consulta sin login. Por OF y no por
        -- pedido: un pedido puede tener una OF con FINALIZAR y otra de
        -- Santiago sin ella, y guardar solo «finalizar cerrada» daría por
        -- rematada la de Santiago a medias. Sin FINALIZAR, la misma regla que
        -- pendiente_total, que NO cambia: es la del equipo.
        CASE WHEN MAX(CASE WHEN es_fin=1 AND terminada=1 THEN 1 ELSE 0 END)=1 THEN 0
             WHEN MAX(es_fin)=1 THEN 1
             ELSE MAX(CASE WHEN tiene_centro=1 THEN 1-terminada ELSE 0 END) END AS trabajo_abierto,
        MAX(CASE WHEN de_seccion=1 THEN fin END) AS fin_seccion, MAX(fin) AS fin_total
      FROM Tareas GROUP BY IDManufacturingOrder
    ), ResumenPedido AS (
      SELECT o.CodOrder AS pedido, MAX(o.OrderDate) AS fecha_pedido,
        COUNT(DISTINCT t.IDManufacturingOrder) AS n_of,
        MAX(t.tiene_seccion) AS tiene_seccion,
        MAX(t.pendiente_seccion) AS pendiente_seccion,
        MAX(t.pendiente_total) AS pendiente_total,
        MAX(t.trabajo_abierto) AS trabajo_abierto,
        MAX(t.fin_seccion) AS fin_seccion, MAX(t.fin_total) AS fin_total,
        -- RPS usa 1900-01-01 como "sin fecha" en ReceptionDemandDate: 86.061 de 427.221
        -- líneas llevan ese centinela, y un MIN sin filtrar se queda con él en cuanto
        -- una sola línea del pedido no tiene fecha (270 pedidos afectados hoy, p.ej.
        -- SA.26.00537 diría 1900-01-01 cuando su entrega real es 2026-05-25). Mismo
        -- filtro que rps.ts:906-912 y el mismo umbral que usa fechaISO.
        MIN(CASE WHEN l.ReceptionDemandDate > '2000-01-01' THEN l.ReceptionDemandDate END) AS fecha_entrega,
        MAX(CASE WHEN l.PendingDelivery = 1 THEN 1 ELSE 0 END) AS pendiente_entrega,
        -- Cuándo salió de verdad: el ÚLTIMO albarán de sus líneas. Por línea y
        -- no por cabecera: FACDeliveryNoteSL.IDOrder está vacío (0 pedidos
        -- enlazados así en 2025 y 2026). Sin albarán, null: ni la solicitada
        -- ni el cierre de tareas valen como sustituto.
        MAX(a.fecha) AS fecha_entregado
      FROM ${busqueda ? "#CoordinaHistorialPedidos" : "dbo.FACOrderSL"} o
      JOIN dbo.FACOrderLineSL l ON l.IDOrder=o.IDOrder
      JOIN ResumenOF t ON t.IDManufacturingOrder=l.IDManufacturingOrder
      ${busqueda ? `-- Un solo pedido: se buscan los albaranes de SUS líneas, sin agrupar
      -- los de toda la casa (ver el CTE Albaranes).
      OUTER APPLY (
        SELECT MAX(d.DeliveryNoteDate) AS fecha
        FROM dbo.FACDeliveryNoteLineSL dl
        JOIN dbo.FACDeliveryNoteSL d ON d.IDDeliveryNote = dl.IDDeliveryNote
        WHERE dl.IDOrderLine = l.IDOrderLine
      ) a` : "LEFT JOIN Albaranes a ON a.IDOrderLine = l.IDOrderLine"}
      ${busqueda ? "" : "WHERE o.CodCompany='001' AND NOT EXISTS (SELECT 1 FROM #CoordinaHistorialPendientes pendiente WHERE pendiente.pedido=o.CodOrder)"}
      GROUP BY o.CodOrder
    ), PedFin AS (
      SELECT pedido, fecha_pedido, n_of, tiene_seccion, pendiente_seccion, pendiente_total,
        fecha_entrega, pendiente_entrega, trabajo_abierto, fecha_entregado,
        CASE WHEN tiene_seccion=1 THEN fin_seccion ELSE fin_total END AS finalizada
      FROM ResumenPedido
    )
    SELECT * INTO #CoordinaHistorialFinalizados FROM PedFin;
    ;WITH PedFin AS (SELECT * FROM #CoordinaHistorialFinalizados)`;
}
