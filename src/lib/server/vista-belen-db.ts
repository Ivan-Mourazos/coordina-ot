import sql from "mssql";
import { getPool } from "./db";
import {
  agruparTiempos,
  estadoOperacion,
  fechaDeTexto,
  unaFilaPorTarea,
  type AvisoOF,
  type FilaTiempo,
  type OFBelen,
  type PedidoBelen,
  type TiemposPedido,
} from "../vista-belen";
import { nombreHistorial } from "../nombre-historial";
import { nombresHistorial } from "./nombres-historial";

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

const FEATURE_COMPROMETIDA = "e655eb1f-3f23-4ccb-846b-9e145d3b8df6";
const TIPO_AVISO: Readonly<Record<string, AvisoOF["tipo"]>> = {
  "001-tp": "TP",
  "cdf68c47-3473-4abd-b32e-5dc5f42fb2a3": "COT",
};

const ES_RPS = () => process.env.DATASOURCE === "rps";

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

const iso = (d: Date | null | undefined): string | null =>
  d && d.getFullYear() > 1900 ? d.toISOString().slice(0, 10) : null;
const texto = (s: string | null | undefined): string | null => (s ?? "").trim() || null;

interface FilaOF {
  cod: string;
  pedido: string;
  linea: number | null;
  cliente: string | null;
  prioridad: number | null;
  cantidad: number;
  descripcion: string | null;
  situacion: string | null;
  notas: string | null;
  fSol: Date | null;
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
  olanet: number | null;
  imps: number;
  tipoAviso: string | null;
  aviso: string | null;
  cierreAviso: Date | null;
}

export async function leerPedidoBelen(codigo: string): Promise<PedidoBelen | null> {
  const pedido = codigo.trim().toUpperCase();
  if (!ES_RPS()) return pedidoDeEjemplo(pedido);

  const pool = await getPool();
  const consulta = <T>(q: string) =>
    pool.request().input("pedido", sql.VarChar(25), pedido).query<T>(`${OFS_DEL_PEDIDO} ${q}`);

  const [ofs, tareas, paquetes, compras, logistica] = await Promise.all([
    consulta<FilaOF>(`
      SELECT o.cod, p.CodOrder AS pedido, lin.NumLine AS linea, cli.Description AS cliente,
             mo.Priority AS prioridad, mo.Quantity AS cantidad,
             CAST(mo.Description AS varchar(300)) AS descripcion, sit.Description AS situacion,
             CAST(mo.Notes AS varchar(1000)) AS notas, lin.ReceptionDemandDate AS fSol,
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
      JOIN dbo.FACOrderLineSL lin ON lin.IDOrderLine = o.idLin
      JOIN dbo.FACOrderSL p ON p.IDOrder = lin.IDOrder
      LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = p.IDCustomer
      JOIN dbo.CPRManufacturingOrderSituation sit ON sit.IDManufacturingOrderSituation = mo.IDMOSituation
      LEFT JOIN dbo._FACOrderLineSL_Custom lc ON lc.IDOrderLine = o.idLin
      LEFT JOIN dbo._FormaEntregaPedido fe ON fe.IDFormaEntregaPedido = lc.IDFormaEntrega`),
    consulta<FilaTarea>(`
      SELECT o.cod, t.IDMOTask AS idTarea, t.CodMOTask AS tarea, CAST(t.Description AS varchar(300)) AS descr,
             t.PercentProgress AS pct, rm.CodMOResourceMachine AS maq,
             (SELECT TOP (1) idestadoof FROM dbo.tgm_estadosof_olanet
               WHERE orden = o.cod AND fase = t.CodMOTask ORDER BY fecha_cambio DESC) AS olanet,
             (SELECT COUNT(*) FROM dbo.CPRImputationMO i WHERE i.IDMOTask = t.IDMOTask) AS imps,
             w.IDMaintenanceWarningType AS tipoAviso, w.MaintenanceWarningCode AS aviso,
             w.ClosingDate AS cierreAviso
      FROM ofs o
      JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = o.id
      LEFT JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = t.IDMOTask
      LEFT JOIN dbo._CPRMOTask_Custom c ON c.IDMOTask = t.IDMOTask
      LEFT JOIN dbo.MANMaintenanceWarning w ON w.IDMaintenanceWarning = c.IDMaintenanceWarning`),
    consulta<{ cod: string; idPaquete: string; fecha: Date | null; empleado: string | null; cantidad: number }>(`
      SELECT o.cod, p.IDPaquete AS idPaquete, p.Fecha AS fecha, emp.Description AS empleado,
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
    consulta<{ cod: string; fecha: Date | null; responsable: string | null }>(`
      SELECT o.cod, om.ExecutionDate AS fecha, emp.Description AS responsable
      FROM ofs o
      JOIN dbo._ACOrderLineSL_PuestaMarcha pm ON pm.IDOrderLine = o.idLin
      JOIN dbo.MANMaintenanceOrder om
        ON om.IDMaintenanceWarning = pm.IDMaintenanceWarning AND om.IDMaintenanceOrderStatus = '001-0'
      LEFT JOIN dbo.GENEmployee emp ON emp.IDEmployee = om.IDResponsible`),
  ]);

  if (!ofs.recordset.length) return null;
  // Una fila por tarea aunque tenga varias máquinas.
  const porTarea = unaFilaPorTarea(tareas.recordset);

  const resultado: OFBelen[] = ofs.recordset.map((f) => {
    const suyas = porTarea.filter((t) => t.cod === f.cod);
    const logs = logistica.recordset.filter((l) => l.cod === f.cod);
    const log = logs.sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0))[0];
    return {
      of: f.cod,
      pedido: f.pedido.trim(),
      linea: f.linea,
      cliente: texto(f.cliente),
      prioridad: f.prioridad,
      descripcion: (f.descripcion ?? "").trim(),
      situacion: (f.situacion ?? "").trim(),
      cantidad: Number(f.cantidad) || 0,
      subidas: Number(f.subidas) || 0,
      fechaSolicitada: iso(f.fSol),
      fechaComprometida: fechaDeTexto(f.fCompro),
      fechaCompras: iso(f.fCompras),
      formaEntrega: texto(f.formaEntrega),
      rotulacion: texto(f.rotulacion),
      notas: texto(f.notas),
      // Operaciones: las tareas con máquina. Las visitas (TP/COT) no llevan
      // máquina y van aparte, como avisos.
      operaciones: suyas
        .filter((t) => t.maq && !TIPO_AVISO[t.tipoAviso ?? ""])
        .sort((a, b) => Number(a.tarea) - Number(b.tarea) || a.tarea.localeCompare(b.tarea))
        .map((t) => ({
          codigo: t.tarea.trim(),
          descripcion: (t.descr ?? "").trim(),
          maquina: texto(t.maq),
          estado: estadoOperacion({ olanet: t.olanet, porcentaje: t.pct, imputaciones: t.imps }),
        })),
      avisos: suyas
        .filter((t) => TIPO_AVISO[t.tipoAviso ?? ""])
        .map((t) => ({
          tipo: TIPO_AVISO[t.tipoAviso!],
          codigo: (t.aviso ?? "").trim(),
          descripcion: (t.descr ?? "").trim(),
          cerrado: iso(t.cierreAviso),
        })),
      paquetes: paquetes.recordset
        .filter((p) => p.cod === f.cod)
        .sort((a, b) => (a.fecha?.getTime() ?? 0) - (b.fecha?.getTime() ?? 0))
        .map((p) => ({
          quien: texto(p.empleado),
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
      logistica: log ? { fecha: iso(log.fecha), responsable: texto(log.responsable) } : null,
    };
  });

  return { codigo: pedido, cliente: resultado[0].cliente, ofs: resultado };
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
    registro: Date | null;
    minutos: number | null;
  }>(`${OFS_DEL_PEDIDO}
    SELECT o.cod AS [of], CAST(mo.Description AS varchar(300)) AS ofDescripcion,
           t.CodMOTask AS tarea, CAST(t.Description AS varchar(300)) AS descripcion,
           (SELECT TOP (1) rm.CodMOResourceMachine FROM dbo.CPRMOResourceMachine rm
             WHERE rm.IDMOTask = t.IDMOTask ORDER BY rm.CodMOResourceMachine) AS maquina,
           t.PercentProgress AS pct,
           (SELECT TOP (1) idestadoof FROM dbo.tgm_estadosof_olanet
             WHERE orden = o.cod AND fase = t.CodMOTask ORDER BY fecha_cambio DESC) AS olanet,
           (SELECT COUNT(*) FROM dbo.CPRImputationMO x WHERE x.IDMOTask = t.IDMOTask) AS imps,
           e.CodEmployee AS codEmpleado, e.Description AS persona, i.ImputationDate AS dia, i.EntryDate AS registro,
           i.ExecutionTime AS minutos
    FROM ofs o
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = o.id
    JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = o.id
    LEFT JOIN dbo.CPRImputationMO i
      ON i.IDMOTask = t.IDMOTask AND i.IDManufacturingOrder = o.id AND i.ResourceType = 1
    LEFT JOIN dbo.GENEmployee e ON e.IDEmployee = i.IDEmployeeMachineTool`);
  if (!r.recordset.length) return null;

  const filas: FilaTiempo[] = r.recordset.map((f) => ({
    of: f.of.trim(),
    ofDescripcion: (f.ofDescripcion ?? "").trim(),
    tarea: f.tarea.trim(),
    descripcion: (f.descripcion ?? "").trim(),
    maquina: texto(f.maquina),
    estado: estadoOperacion({ olanet: f.olanet, porcentaje: f.pct, imputaciones: f.imps }),
    // Un fichaje sin empleado (máquina o dato perdido) no es de nadie: se
    // queda la tarea, sin persona.
    persona: f.persona && f.dia ? nombres.get((f.codEmpleado ?? "").trim()) || nombreHistorial(f.persona) : null,
    dia: iso(f.dia),
    // RPS guarda la hora sin zona y el driver la trae como UTC: la hora del
    // ISO es la del reloj de la nave.
    hora: f.registro && f.registro.getUTCFullYear() > 1900 ? f.registro.toISOString().slice(11, 16) : null,
    minutos: Number(f.minutos) || 0,
  }));
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
