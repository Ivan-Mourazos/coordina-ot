import sql from "mssql";
import { getPool } from "./db";
import {
  agruparTiempos,
  esCodigoOF,
  estadoOperacion,
  fechaDeTexto,
  unaFilaPorTarea,
  type FichandoAhora,
  type FilaTiempo,
  type LineaDescontada,
  type MaterialPedido,
  type OFBelen,
  type PedidoBelen,
  type TiemposPedido,
} from "../vista-belen";
import { nombreHistorial } from "../nombre-historial";
import { nombresHistorial } from "./nombres-historial";
import { ES_RPS, FEATURE_COMPROMETIDA, horaDeSegundos, iso, SEGUNDOS_FICHAJE, SEGUNDOS_MINIMOS, texto, TIPO_AVISO } from "./rps-belen-comun";

// ─── Vista de Belén Alamancos: lectura de RPS ────────────────────────────
// Solo lectura, con el usuario de lectura. Cada dato sale de donde lo sacaban
// las consultas de sus Excels (leídas el 09/11/2026) o, lo que no estaba en
// ellas, de lo que enseñaba su pantalla de antes, contrastado con AR.26.04716:
//
//   bultos subidos      CPRImputationEntryProduct (suma de unidades por OF)
//   paquete             tgm_paquetes_olanet + tgm_detalles_paquetes_olanet
//   fecha comprometida  CPRMOFeature, característica e655eb1f… (texto MM/DD/AAAA,
//                       la rellena Belén). Misma fecha que el BPM de lib/comprometida, pero por OF.
//   prev. logística     orden de mantenimiento abierta del aviso PM de la línea
//   TP / COT            avisos colgados de las tareas (_CPRMOTask_Custom)
//   operaciones         tgm_estadosof_olanet + PercentProgress + imputaciones
//   compras pendientes  PUROrderLine con Quantity > ReceivedQuantity
//
// Un pedido son cinco consultas pequeñas EN PARALELO: medido contra RPS el
// 09/11/2026, unos 55 ms el pedido (250 ms la primera, en frío).


// Las OF del pedido. Todas las consultas parten de aquí, con el código TIPADO
// (varchar, como la columna): sin tipo, SQL Server no usa el índice.
const OFS_DEL_PEDIDO = `
  WITH ofs AS (
    SELECT mo.IDManufacturingOrder AS id, mo.CodManufacturingOrder AS cod, lin.IDOrderLine AS idLin
    FROM dbo.FACOrderSL p
    JOIN dbo.FACOrderLineSL lin ON lin.IDOrder = p.IDOrder
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = lin.IDManufacturingOrder
    WHERE p.CodCompany = '001' AND p.CodOrder = @pedido
  )`;

// Una OF de STOCK no cuelga de ningún pedido (ninguna línea de venta la
// apunta): la ficha se abre con su propio número en lugar del del pedido
// (Belén, 14/11/2026: «las OF de stock no puedo verlas en Apryl», ej. 0233962).
// Misma forma que OFS_DEL_PEDIDO, sin línea. Una OF que sí es de un pedido no
// entra por aquí: se busca por su pedido, como siempre.
const OF_DE_STOCK = `
  WITH ofs AS (
    SELECT mo.IDManufacturingOrder AS id, mo.CodManufacturingOrder AS cod, CAST(NULL AS varchar(50)) AS idLin
    FROM dbo.CPRManufacturingOrder mo
    WHERE mo.CodCompany = '001' AND mo.CodManufacturingOrder = @pedido
      AND NOT EXISTS (SELECT 1 FROM dbo.FACOrderLineSL l WHERE l.IDManufacturingOrder = mo.IDManufacturingOrder)
  )`;

/** La base de todas las consultas: las OF del pedido o, si lo escrito es un
 *  número de OF («0233962»), esa OF de stock. */
const ofsDe = (codigo: string) => (esCodigoOF(codigo) ? OF_DE_STOCK : OFS_DEL_PEDIDO);


interface FilaOF {
  cod: string;
  pedido: string | null;
  linea: number | null;
  cliente: string | null;
  prioridad: number | null;
  cantidad: number;
  descripcion: string | null;
  situacion: string | null;
  notas: string | null;
  detalleLinea: string | null;
  comentarioVenta: string | null;
  fSol: Date | null;
  fEntrega: Date | null;
  articulo: string | null;
  formaEntrega: string | null;
  rotulacion: string | null;
  subidas: number | null;
  fCompro: string | null;
  fCompras: Date | null;
}

interface FilaTarea {
  cod: string;
  idTarea: string;
  tarea: string;
  descr: string | null;
  pct: number | null;
  maq: string | null;
  /** Nombre de la máquina o sección («DISEÑO GRAFICO ARZUA»). */
  maqNombre: string | null;
  olanet: number | null;
  imps: number;
  minutos: number | null;
  ultimo: Date | null;
  bultos: boolean | null;
  finOlanet: Date | null;
  finRps: Date | null;
  planIni: Date | null;
  planFin: Date | null;
  tipoAviso: string | null;
  aviso: string | null;
  cierreAviso: Date | null;
}

export async function leerPedidoBelen(codigo: string): Promise<PedidoBelen | null> {
  const pedido = codigo.trim().toUpperCase();
  if (!ES_RPS()) return pedidoDeEjemplo(pedido);

  const pool = await getPool();
  const consulta = <T>(q: string) =>
    pool.request().input("pedido", sql.VarChar(25), pedido).query<T>(`${ofsDe(pedido)} ${q}`);

  const [ofs, tareas, paquetes, compras, logistica, nombres] = await Promise.all([
    consulta<FilaOF>(`
      SELECT o.cod, p.CodOrder AS pedido, lin.NumLine AS linea, cli.Description AS cliente,
             mo.Priority AS prioridad, mo.Quantity AS cantidad,
             CAST(mo.Description AS varchar(300)) AS descripcion, sit.Description AS situacion,
             CAST(mo.Notes AS varchar(1000)) AS notas, lin.ReceptionDemandDate AS fSol,
             -- «F. ENTREGA» de la hoja de ruta de RPS: la fecha de fabricación de la OF.
             mo.ManualEndDate AS fEntrega,
             CAST((SELECT Description FROM dbo.STKArticle WHERE IDArticle = mo.IDArticle) AS varchar(300)) AS articulo,
             CAST(lin.Comment AS varchar(4000)) AS detalleLinea, CAST(p.Comment AS varchar(4000)) AS comentarioVenta,
             fe.DescripcionFormaEntregaPedido AS formaEntrega, lc.TextoRotulacion AS rotulacion,
             (SELECT SUM(Quantity) FROM dbo.CPRImputationEntryProduct
               WHERE CodCompany = '001' AND IDManufacturingOrder = o.id) AS subidas,
             (SELECT TOP (1) Value FROM dbo.CPRMOFeature
               WHERE IDManufacturingOrder = o.id AND IDFeatureLabel = '${FEATURE_COMPROMETIDA}'
               ORDER BY RowTimestamp DESC) AS fCompro,
             (SELECT MAX(ReceptionDate) FROM dbo.PUROrderLine
               WHERE CodCompany = '001' AND IDManufacturingOrder = o.id
                 AND Quantity > ReceivedQuantity) AS fCompras
      FROM ofs o
      JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = o.id
      -- LEFT: una OF de stock no tiene línea ni pedido.
      LEFT JOIN dbo.FACOrderLineSL lin ON lin.IDOrderLine = o.idLin
      LEFT JOIN dbo.FACOrderSL p ON p.IDOrder = lin.IDOrder
      LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = p.IDCustomer
      JOIN dbo.CPRManufacturingOrderSituation sit ON sit.IDManufacturingOrderSituation = mo.IDMOSituation
      LEFT JOIN dbo._FACOrderLineSL_Custom lc ON lc.IDOrderLine = o.idLin
      LEFT JOIN dbo._FormaEntregaPedido fe ON fe.IDFormaEntregaPedido = lc.IDFormaEntrega`),
    consulta<FilaTarea>(`
      SELECT o.cod, t.IDMOTask AS idTarea, t.CodMOTask AS tarea, CAST(t.Description AS varchar(300)) AS descr,
             t.PercentProgress AS pct, rm.CodMOResourceMachine AS maq,
             -- El nombre de la sección: el de la máquina o, si la tarea va a un
             -- GRUPO de máquinas (SOLD-P, COMA-A, FINAL-P…), el del grupo.
             CAST(COALESCE(maq.Description, grp.Description, rm.Description) AS varchar(100)) AS maqNombre,
             fich.minutos, fich.ultimo,
             -- La tarea en la que se suben los bultos (entrada de producto).
             t.ProductEntry AS bultos,
             -- Cuándo acabó: OLANET al darla por finalizada y, si no, el
             -- cierre de RPS (Belén, 11/11/2026: «la fecha en que finalizaron»).
             (SELECT MAX(fecha_cambio) FROM dbo.tgm_estadosof_olanet
               WHERE orden = o.cod AND fase = t.CodMOTask AND idestadoof = 3) AS finOlanet,
             t.RealEndDate AS finRps,
             -- Lo que dice el planificador de RPS (Belén, 14/11/2026: en las
             -- que faltan, el inicio y el fin que salen en la OF).
             t.PlannedStartDate AS planIni, t.PlannedEndDate AS planFin,
             (SELECT TOP (1) idestadoof FROM dbo.tgm_estadosof_olanet
               WHERE orden = o.cod AND fase = t.CodMOTask ORDER BY fecha_cambio DESC) AS olanet,
             (SELECT COUNT(*) FROM dbo.CPRImputationMO i WHERE i.IDMOTask = t.IDMOTask) AS imps,
             w.IDMaintenanceWarningType AS tipoAviso, w.MaintenanceWarningCode AS aviso,
             w.ClosingDate AS cierreAviso
      FROM ofs o
      JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = o.id
      LEFT JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = t.IDMOTask
      LEFT JOIN dbo.CPRMachine maq ON maq.IDMachine = rm.IDMachine
      LEFT JOIN dbo.CPRMachineGroup grp ON grp.IDMachineGroup = rm.IDMachineGroup
      OUTER APPLY (
        -- Lo fichado por personas (ResourceType = 1, la regla del Historial),
        -- con la duración exacta y sin los fichajes de menos de un minuto.
        SELECT SUM(s.seg) / 60.0 AS minutos, MAX(s.dia) AS ultimo
        FROM (SELECT ${SEGUNDOS_FICHAJE("i")} AS seg, i.ImputationDate AS dia
              FROM dbo.CPRImputationMO i WHERE i.IDMOTask = t.IDMOTask AND i.ResourceType = 1) s
        WHERE s.seg >= ${SEGUNDOS_MINIMOS}
      ) fich
      LEFT JOIN dbo._CPRMOTask_Custom c ON c.IDMOTask = t.IDMOTask
      LEFT JOIN dbo.MANMaintenanceWarning w ON w.IDMaintenanceWarning = c.IDMaintenanceWarning`),
    consulta<{ cod: string; idPaquete: string; fecha: Date | null; empleado: string | null; codEmpleado: string | null; cantidad: number }>(`
      SELECT o.cod, p.IDPaquete AS idPaquete, p.Fecha AS fecha, emp.Description AS empleado, emp.CodEmployee AS codEmpleado,
             d.Cantidad AS cantidad
      FROM ofs o
      JOIN dbo.tgm_detalles_paquetes_olanet d ON d.IDManufacturingOrder = o.id
      JOIN dbo.tgm_paquetes_olanet p ON p.IDPaquete = d.IDPaquete
      LEFT JOIN dbo.GENEmployee emp ON emp.IDEmployee = p.IDEmployee`),
    consulta<{
      cod: string;
      articulo: string | null;
      pedida: number;
      recibida: number;
      prevista: Date | null;
      proveedor: string | null;
    }>(`
      SELECT o.cod, CAST(l.Description AS varchar(200)) AS articulo, l.Quantity AS pedida,
             l.ReceivedQuantity AS recibida, l.ReceptionDate AS prevista, prov.Description AS proveedor
      FROM ofs o
      JOIN dbo.PUROrderLine l ON l.IDManufacturingOrder = o.id AND l.CodCompany = '001'
      JOIN dbo.PUROrder po ON po.IDOrder = l.IDOrder
      LEFT JOIN dbo.PURSupplier prov ON prov.IDSupplier = po.IDSupplier
      WHERE l.Quantity > l.ReceivedQuantity`),
    consulta<{ cod: string; fecha: Date | null; responsable: string | null; codEmpleado: string | null }>(`
      SELECT o.cod, om.ExecutionDate AS fecha, emp.Description AS responsable, emp.CodEmployee AS codEmpleado
      FROM ofs o
      JOIN dbo._ACOrderLineSL_PuestaMarcha pm ON pm.IDOrderLine = o.idLin
      JOIN dbo.MANMaintenanceOrder om
        ON om.IDMaintenanceWarning = pm.IDMaintenanceWarning AND om.IDMaintenanceOrderStatus = '001-0'
      LEFT JOIN dbo.GENEmployee emp ON emp.IDEmployee = om.IDResponsible`),
    nombresHistorial(),
  ]);

  if (!ofs.recordset.length) return pedidoSinOF(pool, pedido);
  // Los nombres, como en «Tareas y tiempos» y el Historial: el del equipo en
  // Coordina si es de los nuestros, el de RPS recortado si no.
  const nombre = (cod: string | null, rps: string | null) =>
    rps ? nombres.get((cod ?? "").trim()) || nombreHistorial(rps) : null;
  // Una fila por tarea aunque tenga varias máquinas (y sus nombres, juntos).
  const porTarea = unaFilaPorTarea(tareas.recordset).map((t) => ({
    ...t,
    maqNombre: [...new Set(tareas.recordset.filter((x) => x.idTarea === t.idTarea).map((x) => texto(x.maqNombre)).filter(Boolean))].join(", ") || null,
  }));

  const resultado: OFBelen[] = ofs.recordset.map((f) => {
    const suyas = porTarea.filter((t) => t.cod === f.cod);
    const logs = logistica.recordset.filter((l) => l.cod === f.cod);
    const log = logs.sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0))[0];
    return {
      of: f.cod.trim(),
      pedido: (f.pedido ?? "").trim(),
      linea: f.linea,
      cliente: texto(f.cliente),
      prioridad: f.prioridad,
      descripcion: (f.descripcion ?? "").trim(),
      situacion: (f.situacion ?? "").trim(),
      cantidad: Number(f.cantidad) || 0,
      subidas: Number(f.subidas) || 0,
      fechaSolicitada: iso(f.fSol),
      fechaEntrega: iso(f.fEntrega),
      articulo: texto(f.articulo),
      fechaComprometida: fechaDeTexto(f.fCompro),
      fechaCompras: iso(f.fCompras),
      formaEntrega: texto(f.formaEntrega),
      rotulacion: texto(f.rotulacion),
      notas: texto(f.notas),
      detalleLinea: texto(f.detalleLinea),
      // Operaciones: todas las tareas menos las visitas (TP/COT), que van
      // aparte, como avisos. En el orden de su código como número.
      operaciones: suyas
        .filter((t) => !TIPO_AVISO[t.tipoAviso ?? ""])
        .sort((a, b) => Number(a.tarea) - Number(b.tarea) || a.tarea.localeCompare(b.tarea))
        .map((t) => ({
          codigo: t.tarea.trim(),
          descripcion: (t.descr ?? "").trim(),
          maquina: texto(t.maq),
          seccion: texto(t.maqNombre),
          minutos: Number(t.minutos) || 0,
          ultimoFichaje: iso(t.ultimo),
          subeBultos: !!t.bultos || undefined,
          ...(() => {
            const estado = estadoOperacion({ olanet: t.olanet, porcentaje: t.pct, imputaciones: t.imps });
            // Solo las acabadas tienen fecha de fin. OLANET guarda fecha y
            // hora del cambio: se toma el día. RPS, el día a medianoche.
            const fin = estado === "finalizado" ? (iso(t.finOlanet) ?? iso(t.finRps)) : null;
            // Las que faltan, con lo que dice el planificador.
            const plan = estado === "finalizado" ? {} : { planInicio: iso(t.planIni), planFin: iso(t.planFin) };
            return { estado, fin, ...plan };
          })(),
        })),
      avisos: suyas
        .filter((t) => TIPO_AVISO[t.tipoAviso ?? ""])
        .map((t) => ({
          tipo: TIPO_AVISO[t.tipoAviso!],
          codigo: (t.aviso ?? "").trim(),
          descripcion: (t.descr ?? "").trim(),
          cerrado: iso(t.cierreAviso),
        })),
      // Un paquete puede traer varias líneas de detalle para la misma OF: se
      // junta por paquete sumando sus unidades, para no contarlo dos veces.
      paquetes: [
        ...paquetes.recordset
          .filter((p) => p.cod === f.cod)
          .reduce((m, p) => {
            const ya = m.get(p.idPaquete);
            if (ya) ya.cantidad = (Number(ya.cantidad) || 0) + (Number(p.cantidad) || 0);
            else m.set(p.idPaquete, { ...p });
            return m;
          }, new Map<string, (typeof paquetes.recordset)[number]>())
          .values(),
      ]
        .sort((a, b) => (a.fecha?.getTime() ?? 0) - (b.fecha?.getTime() ?? 0))
        .map((p) => ({
          quien: nombre(p.codEmpleado, p.empleado),
          fecha: p.fecha ? p.fecha.toISOString() : null,
          unidades: Number(p.cantidad) || 0,
        })),
      compras: compras.recordset
        .filter((c) => c.cod === f.cod)
        .map((c) => ({
          articulo: (c.articulo ?? "").trim(),
          pedida: Number(c.pedida) || 0,
          recibida: Number(c.recibida) || 0,
          prevista: iso(c.prevista),
          proveedor: texto(c.proveedor),
        })),
      logistica: log ? { fecha: iso(log.fecha), responsable: nombre(log.codEmpleado, log.responsable) } : null,
    };
  });

  return {
    codigo: pedido,
    cliente: resultado[0].cliente,
    comentarioVenta: texto(ofs.recordset[0].comentarioVenta),
    ofs: resultado,
    ...(esCodigoOF(pedido) ? { stock: true } : {}),
  };
}

/** Para el buscador: la OF de stock con ese número, como si fuera un pedido
 *  encontrado. [] si no existe o si es de un pedido (entonces sale su pedido). */
export async function buscarOFStock(codigo: string): Promise<{ codigo: string; cliente: string | null; negocio: string | null; fecha: string | null }[]> {
  const of = codigo.trim();
  if (!ES_RPS() || !esCodigoOF(of)) return [];
  const pool = await getPool();
  const r = await pool.request().input("pedido", sql.VarChar(25), of).query<{ cod: string; descripcion: string | null; fecha: Date | null }>(`
    ${OF_DE_STOCK}
    SELECT o.cod, CAST(mo.Description AS varchar(300)) AS descripcion, mo.ManualEndDate AS fecha
    FROM ofs o JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = o.id`);
  return r.recordset.map((f) => ({
    codigo: f.cod.trim(),
    cliente: "OF de stock",
    negocio: texto(f.descripcion),
    fecha: f.fecha ? f.fecha.toISOString() : null,
  }));
}

/** Un pedido que existe pero aún no tiene ninguna OF («sin gestionar»): se
 *  abre igual, con su cliente y su comentario, para que se vea que está ahí.
 *  null si el pedido no existe. */
async function pedidoSinOF(pool: sql.ConnectionPool, pedido: string): Promise<PedidoBelen | null> {
  const r = await pool.request().input("pedido", sql.VarChar(25), pedido).query<{ cliente: string | null; comentario: string | null }>(`
    SELECT TOP (1) cli.Description AS cliente, CAST(p.Comment AS varchar(4000)) AS comentario
    FROM dbo.FACOrderSL p
    LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = p.IDCustomer
    WHERE p.CodCompany = '001' AND p.CodOrder = @pedido`);
  const f = r.recordset[0];
  if (!f) return null;
  return { codigo: pedido, cliente: texto(f.cliente), comentarioVenta: texto(f.comentario), ofs: [] };
}

// ─── Quién ficha AHORA en las OF del pedido ──────────────────────────────────
// tgm_fichajes_olanet es la foto de quién está fichando, que OLANET rehace cada
// pocos minutos (comprobado el 12/11/2026: 15 personas a las 15:10, todas con
// la misma hora de creación). `tiempo` = minutos que lleva en ese tramo;
// `codoperario` = el CodEmployee de RPS, en número. Unos milisegundos: la
// pantalla lo pregunta cada minuto mientras el pedido está abierto.
export async function leerFichandoAhora(codigo: string): Promise<FichandoAhora[]> {
  const pedido = codigo.trim().toUpperCase();
  if (!ES_RPS()) return [];
  const pool = await getPool();
  const [r, nombres] = await Promise.all([
    pool.request().input("pedido", sql.VarChar(25), pedido).query<{
      orden: string;
      fase: string;
      tiempo: number | null;
      maquina: string | null;
      codEmpleado: string | null;
      empleado: string | null;
    }>(`${ofsDe(pedido)}
      SELECT f.orden, f.fase, f.tiempo, f.maquina, emp.CodEmployee AS codEmpleado, emp.Description AS empleado
      FROM dbo.tgm_fichajes_olanet f
      JOIN ofs o ON o.cod = f.orden
      LEFT JOIN dbo.GENEmployee emp
        ON emp.CodCompany = '001' AND emp.CodEmployee = CAST(f.codoperario AS varchar(20))`),
    nombresHistorial(),
  ]);
  return r.recordset.map((f) => ({
    of: f.orden.trim(),
    tarea: f.fase.trim(),
    persona: (f.empleado ? nombres.get((f.codEmpleado ?? "").trim()) || nombreHistorial(f.empleado) : null) ?? "Alguien",
    minutos: Number(f.tiempo) || 0,
    maquina: texto(f.maquina),
  }));
}

// ─── Material: asignado, reservado y comprado ────────────────────────────────
// Las mismas consultas que el tablero de OT (server/rps.ts): se parte del
// MATERIAL asignado y la reserva se suma por fuera (STKStockReserve con
// ItemType = 5 apunta a CPRMOMaterial); las compras van aparte, TODAS, también
// las ya recibidas, para ver qué se pidió y cuándo llegó.
export async function leerMaterialBelen(codigo: string): Promise<MaterialPedido | null> {
  const pedido = codigo.trim().toUpperCase();
  if (!ES_RPS()) return materialDeEjemplo();
  const pool = await getPool();
  const consulta = <T>(q: string) =>
    pool.request().input("pedido", sql.VarChar(25), pedido).query<T>(`${ofsDe(pedido)} ${q}`);
  const [ofs, materiales, compras] = await Promise.all([
    consulta<{ cod: string; descripcion: string | null }>(`
      SELECT o.cod, CAST(mo.Description AS varchar(300)) AS descripcion
      FROM ofs o JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = o.id`),
    consulta<{ cod: string; material: string | null; cantidad: number; reservada: number }>(`
      SELECT o.cod, CAST(m.Description AS varchar(300)) AS material, m.Quantity AS cantidad,
             ISNULL(res.reservada, 0) AS reservada
      FROM ofs o
      JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = o.id
      JOIN dbo.CPRMOMaterial m ON m.IDMOTask = t.IDMOTask
      OUTER APPLY (
        SELECT SUM(r.Quantity) AS reservada FROM dbo.STKStockReserve r
        WHERE r.ItemType = 5 AND r.IDItem = m.IDMOMaterial
      ) res`),
    consulta<{
      cod: string;
      articulo: string | null;
      pedida: number;
      recibida: number;
      fechaPedido: Date | null;
      estimada: Date | null;
      proveedor: string | null;
    }>(`
      SELECT o.cod, CAST(l.Description AS varchar(300)) AS articulo, l.Quantity AS pedida,
             l.ReceivedQuantity AS recibida, po.OrderDate AS fechaPedido, l.ReceptionDate AS estimada,
             prov.Description AS proveedor
      FROM ofs o
      JOIN dbo.PUROrderLine l ON l.IDManufacturingOrder = o.id AND l.CodCompany = '001'
      JOIN dbo.PUROrder po ON po.IDOrder = l.IDOrder
      LEFT JOIN dbo.PURSupplier prov ON prov.IDSupplier = po.IDSupplier
      ORDER BY po.OrderDate`),
  ]);
  if (!ofs.recordset.length) return null;
  return {
    ofs: ofs.recordset
      .map((o) => ({
        of: o.cod.trim(),
        descripcion: (o.descripcion ?? "").trim(),
        materiales: materiales.recordset
          .filter((m) => m.cod === o.cod)
          .map((m) => ({
            descripcion: (m.material ?? "").trim(),
            cantidad: Number(m.cantidad) || 0,
            reservada: Number(m.reservada) || 0,
          })),
        compras: compras.recordset
          .filter((c) => c.cod === o.cod)
          .map((c) => ({
            articulo: (c.articulo ?? "").trim(),
            pedida: Number(c.pedida) || 0,
            recibida: Number(c.recibida) || 0,
            fechaPedido: iso(c.fechaPedido) ?? undefined,
            estimada: iso(c.estimada) ?? undefined,
            proveedor: texto(c.proveedor) ?? undefined,
          })),
      }))
      .sort((a, b) => a.of.localeCompare(b.of)),
  };
}

// ─── Material descontado: lo que salió de verdad ─────────────────────────────
// «Imputación de material» de RPS (CPRImputationMaterialMO), un apunte por
// fila, como la pantalla de RPS: artículo, descripción, operario, almacén,
// cantidad y unidad, fecha y número de serie (Iván, 14/11/2026). El operario
// y el origen van en la tabla custom: IDEmpleado es el IDEmployee («001-45»)
// y Origen dice por dónde entró (PDA = almacén, OLANET = Producción, vacío =
// a mano en RPS; en oct-nov 2026, 2.398 / 1.766 / 1.634 apuntes).
export async function leerDescontadoBelen(codigo: string): Promise<LineaDescontada[] | null> {
  const pedido = codigo.trim().toUpperCase();
  if (!ES_RPS()) return [];
  const pool = await getPool();
  const [r, nombres] = await Promise.all([
    pool.request().input("pedido", sql.VarChar(25), pedido).query<{
      cod: string;
      tarea: string | null;
      articulo: string | null;
      descripcion: string | null;
      cantidad: number | null;
      unidad: string | null;
      almacen: string | null;
      codEmpleado: string | null;
      empleado: string | null;
      fecha: Date | null;
      serie: string | null;
      origen: string | null;
      comentario: string | null;
    }>(`${ofsDe(pedido)}
      SELECT o.cod, t.CodMOTask AS tarea, art.CodArticle AS articulo,
             COALESCE(NULLIF(LTRIM(RTRIM(i.Description)), ''), CAST(art.Description AS varchar(300))) AS descripcion,
             i.Quantity AS cantidad, mu.Abreviature AS unidad, wh.Description AS almacen,
             emp.CodEmployee AS codEmpleado, emp.Description AS empleado,
             i.ImputationDate AS fecha, i.Series AS serie, c.Origen AS origen,
             c.ComentarioMovimientoAlmacn AS comentario
      FROM (SELECT DISTINCT id, cod FROM ofs) o
      JOIN dbo.CPRImputationMaterialMO i ON i.IDManufacturingOrder = o.id AND i.CodCompany = '001'
      LEFT JOIN dbo._CPRImputationMaterialMO_Custom c ON c.IDImputationMaterial = i.IDImputationMaterial
      LEFT JOIN dbo.CPRMOTask t ON t.IDMOTask = i.IDMOTask
      LEFT JOIN dbo.STKArticle art ON art.IDArticle = i.IDArticle
      LEFT JOIN dbo.GENMeasureUnit mu ON mu.IDMeasureUnit = art.IDUnitQuantityWarehouse
      LEFT JOIN dbo.GENWarehouse wh ON wh.IDWarehouse = i.IDWarehouse
      LEFT JOIN dbo.GENEmployee emp ON emp.IDEmployee = c.IDEmpleado
      ORDER BY o.cod, i.ImputationDate, i.EntryDate`),
    nombresHistorial(),
  ]);
  return r.recordset.map((f) => {
    const origen = (f.origen ?? "").trim().toUpperCase();
    // OLANET añade «Transporte: … Generated from OLANET»: no dice nada.
    const comentario = (f.comentario ?? "")
      .replace(/Transporte:\s*/gi, "")
      .replace(/Generated from OLANET/gi, "")
      .trim();
    return {
      of: f.cod.trim(),
      tarea: texto(f.tarea),
      articulo: (f.articulo ?? "").trim(),
      descripcion: (f.descripcion ?? "").trim(),
      cantidad: Number(f.cantidad) || 0,
      unidad: texto(f.unidad),
      almacen: texto(f.almacen),
      operario: f.empleado ? nombres.get((f.codEmpleado ?? "").trim()) || nombreHistorial(f.empleado) : null,
      fecha: iso(f.fecha),
      serie: texto(f.serie),
      origen: origen === "PDA" ? "almacen" : origen === "OLANET" ? "produccion" : "rps",
      comentario: comentario || null,
    };
  });
}

function materialDeEjemplo(): MaterialPedido {
  return {
    ofs: [
      {
        of: "0232470",
        descripcion: "FALDON LATERAL O FRONTAL NUEVO PARA TOLDO FACHADA",
        materiales: [
          { descripcion: "LONA ROJA 3,20 M", cantidad: 6.4, reservada: 0 },
          { descripcion: "TUBO ALUMINIO 40 MM", cantidad: 3, reservada: 3 },
        ],
        compras: [
          { articulo: "LONA ROJA", pedida: 12, recibida: 0, fechaPedido: "2026-11-04", estimada: "2026-11-12", proveedor: "PROVEEDOR DE EJEMPLO" },
        ],
      },
    ],
  };
}

// ─── Tareas y tiempos: cada fichaje ──────────────────────────────────────────
// Todas las tareas de todas las OF del pedido y, por cada una, cada fichaje de
// persona (ResourceType = 1, la regla del Historial) con su día, la hora en
// que se registró (EntryDate) y los minutos (ExecutionTime). Las tareas sin
// fichajes salen igual, con una fila sin persona. Medido el 09/11/2026 contra
// RPS: AR.26.04716 (5 OF, 23 tareas) en unos 60 ms.
export async function leerTiemposBelen(codigo: string): Promise<TiemposPedido | null> {
  const pedido = codigo.trim().toUpperCase();
  if (!ES_RPS()) return agruparTiempos(tiemposDeEjemplo());
  const pool = await getPool();
  // Los nombres, como en el Historial: el del equipo en Coordina si es de los
  // nuestros («José Luis Carrón»), el de RPS recortado si no.
  const nombres = await nombresHistorial();
  const r = await pool.request().input("pedido", sql.VarChar(25), pedido).query<{
    codEmpleado: string | null;
    of: string;
    ofDescripcion: string | null;
    tarea: string;
    descripcion: string | null;
    maquina: string | null;
    pct: number | null;
    olanet: number | null;
    imps: number;
    persona: string | null;
    dia: Date | null;
    inicio: number | null;
    fin: number | null;
    segundos: number | null;
    tipoAviso: string | null;
  }>(`${ofsDe(pedido)}
    SELECT o.cod AS [of], CAST(mo.Description AS varchar(300)) AS ofDescripcion,
           t.CodMOTask AS tarea, CAST(t.Description AS varchar(300)) AS descripcion,
           STUFF((SELECT DISTINCT ', ' + LTRIM(RTRIM(rm.CodMOResourceMachine)) FROM dbo.CPRMOResourceMachine rm
             WHERE rm.IDMOTask = t.IDMOTask FOR XML PATH(''), TYPE).value('.', 'varchar(max)'), 1, 2, '') AS maquina,
           w.IDMaintenanceWarningType AS tipoAviso,
           t.PercentProgress AS pct,
           (SELECT TOP (1) idestadoof FROM dbo.tgm_estadosof_olanet
             WHERE orden = o.cod AND fase = t.CodMOTask ORDER BY fecha_cambio DESC) AS olanet,
           (SELECT COUNT(*) FROM dbo.CPRImputationMO x WHERE x.IDMOTask = t.IDMOTask) AS imps,
           e.CodEmployee AS codEmpleado, e.Description AS persona, i.ImputationDate AS dia,
           i.StartHour AS inicio, i.EndHour AS fin, ${SEGUNDOS_FICHAJE("i")} AS segundos
    FROM ofs o
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = o.id
    JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = o.id
    LEFT JOIN dbo._CPRMOTask_Custom c ON c.IDMOTask = t.IDMOTask
    LEFT JOIN dbo.MANMaintenanceWarning w ON w.IDMaintenanceWarning = c.IDMaintenanceWarning
    LEFT JOIN dbo.CPRImputationMO i
      ON i.IDMOTask = t.IDMOTask AND i.IDManufacturingOrder = o.id AND i.ResourceType = 1
    LEFT JOIN dbo.GENEmployee e ON e.IDEmployee = i.IDEmployeeMachineTool`);
  if (!r.recordset.length) return null;

  const filas: FilaTiempo[] = r.recordset.map((f) => {
    // Un fichaje sin empleado (máquina o dato perdido) no es de nadie, y uno de
    // menos de un minuto es ruido: en los dos casos se queda la tarea, sin
    // persona, para que siga saliendo en la lista.
    const segundos = Number(f.segundos) || 0;
    const cuenta = !!(f.persona && f.dia) && segundos >= SEGUNDOS_MINIMOS;
    return {
      of: f.of.trim(),
      ofDescripcion: (f.ofDescripcion ?? "").trim(),
      tarea: f.tarea.trim(),
      descripcion: (f.descripcion ?? "").trim(),
      maquina: texto(f.maquina),
      estado: estadoOperacion({ olanet: f.olanet, porcentaje: f.pct, imputaciones: f.imps }),
      visita: !!TIPO_AVISO[f.tipoAviso ?? ""] || undefined,
      persona: cuenta ? nombres.get((f.codEmpleado ?? "").trim()) || nombreHistorial(f.persona) : null,
      dia: cuenta ? iso(f.dia) : null,
      // La hora en que empezó y acabó de verdad (StartHour/EndHour), no la
      // de cuando el fichaje se volcó a RPS.
      hora: cuenta ? horaDeSegundos(f.inicio) : null,
      horaFin: cuenta ? horaDeSegundos(f.fin) : null,
      // Exactos: minutos con decimales (segundos / 60), sin redondear.
      minutos: cuenta ? segundos / 60 : 0,
    };
  });
  return agruparTiempos(filas);
}

function tiemposDeEjemplo(): FilaTiempo[] {
  const base = { of: "0232470", ofDescripcion: "FALDON LATERAL O FRONTAL NUEVO PARA TOLDO FACHADA", maquina: "A-COAC" };
  return [
    { ...base, tarea: "5", descripcion: "CORTAR FALDON", estado: "finalizado", persona: "Teresa Vázquez", dia: "2026-11-03", hora: "10:00", minutos: 14 },
    { ...base, tarea: "5", descripcion: "CORTAR FALDON", estado: "finalizado", persona: "Pilar Santos", dia: "2026-11-03", hora: "10:00", minutos: 14 },
    { ...base, tarea: "19", descripcion: "CONFECCIONAR FALDON", maquina: "A-CONF", estado: "interrumpido", persona: "José Manuel Santos", dia: "2026-11-03", hora: "12:30", minutos: 13 },
    { ...base, tarea: "31", descripcion: "CORTAR Y MONTAR TUBO FALDON", maquina: "A-CALD", estado: "sin_empezar", persona: null, dia: null, hora: null, minutos: 0 },
  ];
}

// ─── Sin RPS (desarrollo) ────────────────────────────────────────────────────
// Un pedido de muestra con la forma de AR.26.04716, el ejemplo de Belén, para
// poder mirar la pantalla en local con DATASOURCE=mock.
function pedidoDeEjemplo(codigo: string): PedidoBelen {
  const base = {
    pedido: codigo,
    linea: 1,
    cliente: "MAHOU, S.A.",
    prioridad: 2,
    fechaSolicitada: "2026-11-16",
    fechaCompras: null,
    formaEntrega: "INSTALAR",
    rotulacion: "MAHOU 5 ESTRELLAS+ REVOLVER",
    notas: null,
    avisos: [],
    compras: [],
    logistica: null,
  };
  const ofs: OFBelen[] = [
    {
      ...base,
      of: "0232466",
      descripcion: "CAMBIO DE TELA A TOLDO DE FACHADA MANUAL",
      situacion: "FINALIZADA",
      cantidad: 3,
      subidas: 3,
      fechaComprometida: null,
      operaciones: [
        { codigo: "02", descripcion: "PLANTEAR Y PREPARA ARCHIVOS MAQ. DE CORTE", maquina: "OTEC-A", estado: "finalizado" },
        { codigo: "10", descripcion: "EMPATAR PAÑOS Y ESCUADRAR", maquina: "A-CFAC", estado: "finalizado" },
      ],
      paquetes: [{ quien: "VAZQUEZ QUINTEIRO, TERESA", fecha: "2026-10-05T14:36:00.000Z", unidades: 1 }],
    },
    {
      ...base,
      of: "0232470",
      descripcion: "FALDON LATERAL O FRONTAL NUEVO PARA TOLDO FACHADA",
      situacion: "CON IMPUTACIONES",
      cantidad: 3,
      subidas: 0,
      fechaComprometida: "2026-11-11",
      notas: "04/11: CONFIRMA JORGE QUE NON SE ROTULAN",
      operaciones: [
        { codigo: "5", descripcion: "CORTAR FALDON", maquina: "A-COAC", estado: "finalizado" },
        { codigo: "19", descripcion: "CONFECCIONAR FALDON", maquina: "A-CONF", estado: "interrumpido" },
        { codigo: "31", descripcion: "CORTAR Y MONTAR TUBO FALDON", maquina: "A-CALD", estado: "sin_empezar" },
      ],
      avisos: [{ tipo: "TP", codigo: "I131306", descripcion: "23/09 VISITA MEDIR", cerrado: "2026-10-20" }],
      paquetes: [],
      compras: [
        { articulo: "LONA ROJA", pedida: 12, recibida: 0, prevista: "2026-11-12", proveedor: "PROVEEDOR DE EJEMPLO" },
      ],
      fechaCompras: "2026-11-12",
      logistica: { fecha: "2026-11-11", responsable: "VALIÑO ALAMANCOS, JOSE LUIS" },
    },
  ];
  return { codigo, cliente: base.cliente, ofs };
}
