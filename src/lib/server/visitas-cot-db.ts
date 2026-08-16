import sql from "mssql";
import {
  VISITAS_COT_PAGE_SIZE,
  filaAVisitaCot,
  type FilaVisitaCot,
  type VisitaCot,
  type VisitasCotFiltros,
  type VisitasCotPagina,
} from "../visitas-cot";
import { getPool } from "./db";
import { diasEntre, sumarDias } from "../fechas";
import { hoyISO } from "../types";

// ─── Visitas COT: acceso de solo lectura a RPS ───────────────────────────────

// Las fechas del mock se escriben a mano pero se mueven con el calendario: si
// no, al mes siguiente la agenda de simulación sale entera "Atrasada" y no se
// parece a lo que se ve en un día normal (que es para lo que sirve). El ancla
// es la primera visita pendiente, así que esa cae siempre en hoy.
const ANCLA_VISITAS = "2026-07-31";

function alCalendario(visita: VisitaCot, dias: number): VisitaCot {
  return {
    ...visita,
    fechaAviso: visita.fechaAviso ? sumarDias(visita.fechaAviso, dias) : visita.fechaAviso,
    fechaVisita: visita.fechaVisita ? sumarDias(visita.fechaVisita, dias) : visita.fechaVisita,
  };
}

const MOCK_BASE: VisitaCot[] = [
  {
    idOrden: "OM-COT-001",
    incidencia: "I129576",
    pedido: "AR.26.02490",
    fechaAviso: "2026-07-28T09:15:00.000Z",
    fechaVisita: "2026-07-31",
    // Con la forma real de RPS —encabezado, cuerpo y línea de OF— para que el
    // mock ejercite el mismo desglose que los datos de verdad.
    texto:
      "28/07/2026 - CASTRO MOURIÑO, JUAN JOSE - I129576\r\n\r\n" +
      "Solicita visita del comercial con Oficina Técnica para revisar medidas.\r\n" +
      "OF 0230001 - PEDIDO AR.26.02490 - MAHOU, S.A.",
    motivo: "Solicita visita del comercial con Oficina Técnica para revisar medidas.",
    cliente: "MAHOU, S.A.",
    responsable: "Juan José Castro Mouriño",
    estado: "pendiente",
    estadoRps: "Creado",
    solucion: null,
    notas: null,
  },
  {
    idOrden: "OM-COT-002",
    incidencia: "I129611",
    pedido: "AR.26.02531",
    fechaAviso: "2026-07-29T11:40:00.000Z",
    fechaVisita: "2026-08-01",
    texto:
      "29/07/2026 - DURO VILA, CARLOS JAVIER - I129611\r\n\r\n" +
      "Visita para aclarar el cerramiento antes de pasar a fabricación.",
    motivo: "Visita para aclarar el cerramiento antes de pasar a fabricación.",
    cliente: null,
    responsable: "Carlos Javier Duro Vila",
    estado: "pendiente",
    estadoRps: "Creado",
    solucion: null,
    notas: "Llevar plano de obra.",
  },
  {
    idOrden: "OM-COT-003",
    incidencia: "I129611",
    pedido: "AR.26.02531",
    fechaAviso: "2026-07-29T11:40:00.000Z",
    fechaVisita: "2026-08-02",
    texto: "Segunda visita de comprobación de cotas.",
    motivo: "Segunda visita de comprobación de cotas.",
    cliente: null,
    responsable: "Juan José Castro Mouriño",
    estado: "pendiente",
    estadoRps: "Creado",
    solucion: null,
    notas: null,
  },
  {
    idOrden: "OM-COT-004",
    incidencia: "I129102",
    pedido: "AR.26.01984",
    fechaAviso: "2026-07-20T08:00:00.000Z",
    fechaVisita: "2026-07-25",
    texto: "Comprobar anclajes y recorrido del toldo.",
    motivo: "Comprobar anclajes y recorrido del toldo.",
    cliente: null,
    responsable: "Carlos Javier Duro Vila",
    estado: "cerrada",
    estadoRps: "Cerrado",
    solucion: "MEDICIÓN REALIZADA",
    notas: "Croquis adjunto al expediente.",
  },
  {
    idOrden: "OM-COT-005",
    incidencia: "I128993",
    pedido: null,
    fechaAviso: "2026-07-16T10:20:00.000Z",
    fechaVisita: "2026-07-18",
    texto: "Visita previa sin pedido enlazado.",
    motivo: "Visita previa sin pedido enlazado.",
    cliente: null,
    responsable: "Juan José Castro Mouriño",
    estado: "cerrada",
    estadoRps: "Cerrado",
    solucion: "ACLARADO CON CLIENTE",
    notas: null,
  },
];

function paginaMock(filtros: VisitasCotFiltros): VisitasCotPagina {
  // Se recalcula en cada petición, no al importar el módulo: el server puede
  // llevar días levantado y "hoy" no puede quedarse congelado en el arranque.
  const desfase = diasEntre(ANCLA_VISITAS, hoyISO());
  const MOCK_VISITAS = MOCK_BASE.map((v) => alCalendario(v, desfase));
  const estado =
    filtros.ambito === "todas" ? null : filtros.ambito === "pendientes" ? "pendiente" : "cerrada";
  const q = filtros.q?.toLocaleLowerCase("es") ?? "";
  const visitas = MOCK_VISITAS.filter((visita) => {
    if (estado !== null && visita.estado !== estado) return false;
    if (filtros.desde && (visita.fechaVisita ?? "") < filtros.desde) return false;
    if (filtros.hasta && (visita.fechaVisita ?? "") > filtros.hasta) return false;
    if (!q) return true;
    return [
      visita.incidencia,
      visita.pedido ?? "",
      visita.texto,
      visita.responsable,
      visita.solucion ?? "",
      visita.notas ?? "",
    ].some((value) => value.toLocaleLowerCase("es").includes(q));
  }).toSorted((a, b) => {
    const orden = (a.fechaVisita ?? "").localeCompare(b.fechaVisita ?? "");
    return filtros.ambito === "historial" ? -orden : orden;
  });

  const inicio = filtros.page * VISITAS_COT_PAGE_SIZE;
  const pagina = visitas.slice(inicio, inicio + VISITAS_COT_PAGE_SIZE + 1);
  return {
    visitas: pagina.slice(0, VISITAS_COT_PAGE_SIZE),
    hasMore: pagina.length > VISITAS_COT_PAGE_SIZE,
    refreshedAt: new Date().toISOString(),
  };
}

async function paginaRps(
  filtros: VisitasCotFiltros,
): Promise<VisitasCotPagina> {
  const pool = await getPool();
  const request = pool.request();
  // "todas" no filtra por estado: el calendario enseña el mes entero y lo que
  // distingue una visita hecha de una pendiente es su color, no que falte.
  const condiciones =
    filtros.ambito === "todas"
      ? ["1 = 1"]
      : [filtros.ambito === "pendientes" ? "b.idEstado = '001-0'" : "b.idEstado = '001-9'"];

  if (filtros.q) {
    condiciones.push(`(
      b.incidencia LIKE @q
      OR ISNULL(b.pedido, '') LIKE @q
      OR ISNULL(b.texto, '') LIKE @q
      OR ISNULL(b.responsable, '') LIKE @q
      OR ISNULL(b.solucion, '') LIKE @q
      OR ISNULL(b.notas, '') LIKE @q
    )`);
    request.input("q", sql.NVarChar(122), `%${filtros.q}%`);
  }
  if (filtros.desde) {
    condiciones.push("b.fechaVisita >= @desde");
    request.input("desde", sql.Date, filtros.desde);
  }
  if (filtros.hasta) {
    condiciones.push("b.fechaVisita < DATEADD(day, 1, @hasta)");
    request.input("hasta", sql.Date, filtros.hasta);
  }

  request.input(
    "offset",
    sql.Int,
    filtros.page * VISITAS_COT_PAGE_SIZE,
  );
  request.input("limit", sql.Int, VISITAS_COT_PAGE_SIZE + 1);

  // Las pendientes se leen hacia delante (lo que viene) y el historial hacia
  // atrás (lo último). "todas" es una ventana de mes concreta: cronológica.
  const direccion = filtros.ambito === "historial" ? "DESC" : "ASC";
  const resultado = await request.query<FilaVisitaCot>(`
    ;WITH Base AS (
      SELECT
        om.IDMaintenanceOrder AS id,
        w.MaintenanceWarningCode AS incidencia,
        ped.CodOrder AS pedido,
        w.EntryDate AS fechaAviso,
        om.ExecutionDate AS fechaVisita,
        w.Description AS texto,
        emp.Description AS responsable,
        om.IDMaintenanceOrderStatus AS idEstado,
        est.Description AS estado,
        sol.Descripcion AS solucion,
        om.Notes AS notas
      FROM dbo.MANMaintenenceWarningType t
      JOIN dbo.MANMaintenanceWarning w
        ON w.IDMaintenanceWarningType = t.IDMaintenanceWarningType
      JOIN dbo.MANMaintenanceOrder om
        ON om.IDMaintenanceWarning = w.IDMaintenanceWarning
       AND om.CodCompany = '001'
      LEFT JOIN dbo.MANMaintenanceOrderStatus est
        ON est.IDMaintenanceOrderStatus = om.IDMaintenanceOrderStatus
      LEFT JOIN dbo.GENEmployee emp
        ON emp.IDEmployee = om.IDResponsible
      LEFT JOIN dbo._MANMaintenanceOrder_Custom omc
        ON omc.IDMaintenanceOrder = om.IDMaintenanceOrder
      LEFT JOIN dbo.tgm_soluciones_sat sol
        ON sol.IDSolucionSAT = omc.IDSolucionSAT
      OUTER APPLY (
        SELECT TOP 1 ord.CodOrder
        FROM dbo._CPRMOTask_Custom tc
        JOIN dbo.CPRMOTask task ON task.IDMOTask = tc.IDMOTask
        JOIN dbo.CPRManufacturingOrder mo
          ON mo.IDManufacturingOrder = task.IDManufacturingOrder
         AND mo.CodCompany = '001'
        JOIN dbo.FACOrderLineSL ol
          ON ol.IDManufacturingOrder = mo.IDManufacturingOrder
        JOIN dbo.FACOrderSL ord
          ON ord.IDOrder = ol.IDOrder
         AND ord.CodCompany = '001'
        WHERE tc.IDMaintenanceWarning = w.IDMaintenanceWarning
        ORDER BY ord.OrderDate DESC, ord.CodOrder DESC
      ) ped
      WHERE t.CodMaintenanceWarningType = 'COT'
        AND t.CodCompany = '001'
    )
    SELECT
      b.id, b.incidencia, b.pedido, b.fechaAviso, b.fechaVisita, b.texto,
      b.responsable, b.idEstado, b.estado, b.solucion, b.notas
    FROM Base b
    WHERE ${condiciones.join("\n      AND ")}
    ORDER BY b.fechaVisita ${direccion}, b.id ${direccion}
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
  `);

  const visitas = resultado.recordset.map(filaAVisitaCot);
  return {
    visitas: visitas.slice(0, VISITAS_COT_PAGE_SIZE),
    hasMore: visitas.length > VISITAS_COT_PAGE_SIZE,
    refreshedAt: new Date().toISOString(),
  };
}

export async function leerVisitasCot(
  filtros: VisitasCotFiltros,
): Promise<VisitasCotPagina> {
  return process.env.DATASOURCE === "rps"
    ? paginaRps(filtros)
    : paginaMock(filtros);
}
