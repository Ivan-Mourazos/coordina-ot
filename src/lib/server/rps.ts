import type { Tablero } from "../data";
import type { Familia, OF, Pedido, Prioridad } from "../types";
import { hoyISO } from "../types";
import { OPERARIOS } from "../mock";
import { operarioDeEmpleado } from "./operarios";

// ─── Adaptador RPS → contrato de la UI ───────────────────────────────────────
// Lee la vista RPSNext.dbo.TGM_PENDIENTE_OT (1 fila = 1 OF pendiente de OT,
// creada por IT) y los fichajes vivos de tgm_fichajes_olanet. Devuelve las
// MISMAS formas que el mock. Reglas y avisos de IT:
//  · La vista es pesada (7-15 s según hora) → caché en memoria con TTL.
//  · Los datos traen de todo (OFs con errores, sin pedido, sin cliente…):
//    se interpreta lo mejor posible, nunca se rompe por una fila mala.
//  · Operarios: zonas del tablero aún estáticas (mismas personas que el mock);
//    la asignación autor/revisor no vive en RPS todavía.

const TTL_MS = 60_000;

interface FilaVista {
  OF: string | null;
  CodTarea: string | null;
  Tarea: string | null;
  Pedido: string | null;
  Cliente: string | null;
  Articulo: string | null;
  Rotulacion: string | null;
  FechaSolicitada: Date | null;
  Prioridad: number | null;
  TiempoPrevisto: number | null;
  /** Llegada prevista del material de compras pendiente (null = nada pendiente). */
  FechaCompras: Date | null;
  /** Fecha de planificación de la tarea de OT (la que ordena el trabajo). */
  FechaPlanificada: Date | null;
  SitOF: string | null;
  NotasOF: string | null;
  // De CPRManufacturingOrder (JOIN por CodManufacturingOrder, empresa 001):
  DescripcionMO: string | null;
  Cantidad: number | null;
  PlannedStartDate: Date | null;
  PlannedEndDate: Date | null;
}

interface FilaFichaje {
  orden: string | null;
  fase: string | null;
  tiempo: number | null;
  codoperario: number | null;
}

interface FilaReserva {
  orden: string | null;
  reservas: number;
}

interface FilaImputacion {
  orden: string | null;
  tarea: string | null;
  empleado: string | null;
  minutos: number | null;
}

interface FilaVenta {
  pedido: string | null;
  comentario: string | null;
  ciudad: string | null;
  /** Fecha solicitada por el cliente (mín. de ReceptionDemandDate de las
   *  líneas): es la "Fecha solicitada" que aparece en el parte escaneado. */
  solicitada: Date | null;
  /** Negocio/local de entrega ("Empresa/Negocio" del parte). */
  negocio: string | null;
  /** Fecha en la que se creó el pedido de venta en RPS. */
  creacion: Date | null;
}

interface FilaTarea {
  orden: string | null;
  codTarea: string | null;
  descripcion: string | null;
  planificada: Date | null;
  cancelada: boolean | null;
}

interface FilaHistorial {
  orden: string | null;
  codTarea: string | null;
  /** Cuándo se marcó finalizada la fase de OT (tgm_estadosof_olanet). */
  finalizada: Date | null;
  descripcionMO: string | null;
  cantidad: number | null;
  /** Pedido de venta si se pudo enlazar (ver comentario en la query). */
  pedido: string | null;
  cliente: string | null;
  creacion: Date | null;
  solicitada: Date | null;
}

/** "Tarea-nota" de la ruta: aviso apuntado como tarea ("22/06 VISITA MEDIR").
 *  Se reconocen por empezar con una fecha dd/mm. Heurística acordada tras ver
 *  los datos reales; si Producción cambia la costumbre, ajustar aquí. */
function esNota(descripcion: string): boolean {
  return /^\s*\d{1,2}\/\d{1,2}\b/.test(descripcion);
}

// ─── Interpretación tolerante de campos sueltos ──────────────────────────────

/** "  2 - TOLDO FACHADA " → "TOLDO FACHADA". */
function textoArticulo(articulo: string | null): string {
  if (!articulo) return "";
  const i = articulo.indexOf("-");
  return (i >= 0 ? articulo.slice(i + 1) : articulo).trim();
}

/** Mapea a una familia del catálogo mirando primero la descripción real de la
 *  OF (más fina: "CERRAMIENTO TEXTIL CON LONA…" → LONA) y después el grupo de
 *  artículo de RPS ("CERRAMIENTOS"). Lo que no encaja pasa como texto tal cual
 *  (familiaMeta le da tinte neutro). */
function familiaDeTexto(descripcionMO: string | null, articulo: string | null): Familia {
  const grupo = textoArticulo(articulo).toUpperCase();
  const desc = (descripcionMO ?? "").toUpperCase();
  for (const t of [desc, grupo]) {
    if (!t) continue;
    if (t.includes("TOLDO")) return "TOLDO";
    if (t.includes("LONA") || t.includes("ROLLO")) return "LONA";
    if (t.includes("CARPA")) return "CARPA";
    if (t.includes("REMOLQUE")) return "REMOLQUE";
    if (t.includes("TAPIZ")) return "TAPIZADO";
    if (t.includes("REPARAC")) return "REPARACION";
    if (t.includes("SUMINISTRO")) return "SUMINISTRO";
  }
  return grupo || "OTRO";
}

function familiaDe(fila: FilaVista): Familia {
  return familiaDeTexto(fila.DescripcionMO, fila.Articulo);
}

/** Escala nueva: 1 = poca, 2 = normal, 3 = urgente (si es 3, la fecha de
 *  planificación se respeta al 100%). Fuera de rango (null, 0, erróneo) → 1
 *  (poca), no la máxima: un dato ausente no debe disparar urgencia. */
function prioridadDe(n: number | null): Prioridad {
  return n === 1 || n === 2 || n === 3 ? n : 1;
}

/** Fecha ISO o null si no hay dato utilizable. RPS usa 1900-01-01 como
 *  centinela de "sin fecha" (que además llega como 31/12/1899 tras el ajuste
 *  UTC→local): cualquier año < 2000 se trata como ausencia de dato. */
function fechaISO(d: Date | null): string | null {
  if (!d || Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Situaciones de RPS que admiten imputaciones (AllowImputations en
 *  CPRManufacturingOrderSituation). Fichar fuera de estas = tiempo que NO
 *  sube a RPS (aviso de IT). */
const SITUACIONES_FICHABLES = new Set([
  "LANZADA",
  "IMPRESA",
  "CON IMPUTACIONES",
]);

function descripcionDe(fila: FilaVista): string {
  const mo = (fila.DescripcionMO ?? "").trim();
  const articulo = textoArticulo(fila.Articulo);
  const notas = (fila.NotasOF ?? "").trim();
  const tarea = (fila.Tarea ?? "").trim();
  return mo || articulo || notas || tarea || "(sin descripción)";
}

interface DatosOF {
  /** undefined = nadie fichando; null = fichando alguien de fuera de OT. */
  fichandoOperario: string | null | undefined;
  reservas: number;
  /** Operario del tablero con más tiempo imputado en la tarea (autor real). */
  autorImputado: string | null;
  /** Minutos imputados en la tarea de OT (todos los empleados). */
  minutosImputados: number;
  /** Tareas-nota de la ruta ("22/06 VISITA MEDIR"). */
  avisos: string[];
  /** Arranque planificado de la primera fase de producción tras el planteo. */
  fechaLimitePlanteo: string | undefined;
}

function aOF(fila: FilaVista, datos: DatosOF): OF {
  const orden = (fila.OF ?? "").trim();
  const fichadoMin = datos.minutosImputados;
  const sit = (fila.SitOF ?? "").trim().toUpperCase();
  const fichadaAhora = datos.fichandoOperario !== undefined;
  return {
    id: `${orden}:${(fila.CodTarea ?? "").trim()}`,
    codigo: orden,
    descripcion: descripcionDe(fila),
    familia: familiaDe(fila),
    piezas: Math.max(1, Math.round(fila.Cantidad ?? 1)),
    // Autor: quien ficha ahora la OF o, si nadie, quien más tiempo le ha
    // imputado (según RPS). La asignación manual del tablero puede moverlo.
    autorId: datos.fichandoOperario ?? datos.autorImputado,
    revisorId: null,
    // El fichaje del terminal de RPS solo cubre el planteo; la revisión es
    // propia de CoordinaOT y aún no existe en origen.
    estado: fichadaAhora || fichadoMin > 0 ? "en_curso" : "pendiente",
    fichandoRol: fichadaAhora ? "plantear" : null,
    detenida: sit === "DETENIDA",
    fichable: SITUACIONES_FICHABLES.has(sit),
    rotulacion: (fila.Rotulacion ?? "").trim() || undefined,
    materialPendienteHasta: fechaISO(fila.FechaCompras) ?? undefined,
    reservasMaterial: datos.reservas,
    avisos: datos.avisos.length ? datos.avisos : undefined,
    fechaLimitePlanteo: datos.fechaLimitePlanteo,
    tiempoEstimadoMin: fila.TiempoPrevisto ?? 0,
    tiempoPlanteoMin: fichadoMin,
    tiempoRevisionMin: 0,
    observacion: (fila.NotasOF ?? "").trim() || undefined,
  };
}

/** OF ya finalizada en OT (Historial): no hay fichaje vivo ni situación RPS
 *  que consultar, así que se rellena lo mínimo con lo que da la query. */
function aOFHistorial(
  fila: FilaHistorial,
  minutosImputados: number,
  autorImputado: string | null,
): OF {
  const orden = (fila.orden ?? "").trim();
  return {
    id: `${orden}:${(fila.codTarea ?? "").trim()}`,
    codigo: orden,
    descripcion: (fila.descripcionMO ?? "").trim() || "(sin descripción)",
    familia: familiaDeTexto(fila.descripcionMO, null),
    piezas: Math.max(1, Math.round(fila.cantidad ?? 1)),
    autorId: autorImputado,
    revisorId: null,
    estado: "aprobada",
    fichandoRol: null,
    tiempoEstimadoMin: 0,
    tiempoPlanteoMin: minutosImputados,
    tiempoRevisionMin: 0,
  };
}

// ─── Consulta + agrupado ─────────────────────────────────────────────────────

async function consultarTablero(): Promise<Tablero> {
  const { getPool } = await import("./db");
  const pool = await getPool();

  // La vista va primero (es LA consulta cara y da la lista de OFs pendientes);
  // el resto de datos auxiliares se piden en paralelo contra tablas indexadas.
  // El historial (Historial del Board) NO toca la vista pesada: sale de
  // tgm_estadosof_olanet (fin de fase) cruzada con CPRMOTask/CPRManufacturingOrder,
  // así que se lanza en paralelo con la vista sin depender de ella.
  const [vista, historialFin] = await Promise.all([
    pool.request().query<FilaVista>(`
      SELECT v.[OF], v.CodTarea, v.Tarea, v.Pedido, v.Cliente, v.Articulo,
             v.Rotulacion, v.FechaSolicitada, v.Prioridad, v.TiempoPrevisto,
             v.FechaCompras, v.FechaPlanificada, v.SitOF, v.NotasOF,
             mo.Description AS DescripcionMO, mo.Quantity AS Cantidad,
             mo.PlannedStartDate, mo.PlannedEndDate
      FROM dbo.TGM_PENDIENTE_OT v
      LEFT JOIN dbo.CPRManufacturingOrder mo
        ON mo.CodManufacturingOrder = v.[OF] AND mo.CodCompany = '001'
    `),
    // Historial de finalizados (últimos 60 días): tgm_estadosof_olanet marca
    // fin de CUALQUIER fase (idestadoof=3), así que hay que quedarse solo con
    // la fase de OT. Se identifica igual que la vista pesada: CPRMOTask cuyo
    // recurso asignado es 'a-otec'/'otec-a' (comprobado con datos reales:
    // coincide con las tareas "PLANTEAR…"). Vínculo OF→pedido de venta: no
    // existe un FK directo, así que se busca vía FACOrderLineSL.IDManufacturingOrder
    // (mejor esfuerzo con TOP 1; si no hay línea de venta ligada, el pedido
    // queda "suelto" con cliente desconocido — se documenta la limitación,
    // mejor mostrar algo que nada).
    pool.request().query<FilaHistorial>(`
      ;WITH Fin AS (
        SELECT e.orden, e.fase AS codTarea, MAX(e.fecha_cambio) AS finalizada
        FROM dbo.tgm_estadosof_olanet e
        WHERE e.idestadoof = 3 AND e.fecha_cambio > DATEADD(day, -60, GETDATE())
        GROUP BY e.orden, e.fase
      )
      SELECT f.orden, f.codTarea, f.finalizada,
             mo.Description AS descripcionMO, mo.Quantity AS cantidad,
             v.CodOrder AS pedido, v.cliente, v.OrderDate AS creacion, v.solicitada
      FROM Fin f
      JOIN dbo.CPRManufacturingOrder mo
        ON mo.CodManufacturingOrder = f.orden AND mo.CodCompany = '001'
      JOIN dbo.CPRMOTask t
        ON t.IDManufacturingOrder = mo.IDManufacturingOrder AND t.CodMOTask = f.codTarea
      OUTER APPLY (
        SELECT TOP 1 o.CodOrder, o.OrderDate, cli.Description AS cliente,
               l.ReceptionDemandDate AS solicitada
        FROM dbo.FACOrderLineSL l
        JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder
        LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = o.IDCustomer
        WHERE l.IDManufacturingOrder = mo.IDManufacturingOrder
      ) v
      WHERE EXISTS (
        SELECT 1 FROM dbo.CPRMOResourceMachine rm
        WHERE rm.IDMOTask = t.IDMOTask AND rm.CodMOResourceMachine IN ('a-otec', 'otec-a')
      )
    `),
  ]);

  // Lista de OFs pendientes saneada para usar en IN (…): solo códigos limpios.
  const ordenes = [
    ...new Set(
      vista.recordset
        .map((f) => (f.OF ?? "").trim())
        .filter((o) => /^[\w.-]+$/.test(o)),
    ),
  ];
  const listaIn = ordenes.length
    ? ordenes.map((o) => `'${o}'`).join(",")
    : "''";
  const ordenesEnTablero = new Set(ordenes);

  // OFs del historial saneadas, excluyendo las que ya están pendientes en el
  // tablero (evita duplicar tarjeta si una OF vuelve a estar en curso).
  const ordenesHistorial = [
    ...new Set(
      historialFin.recordset
        .map((f) => (f.orden ?? "").trim())
        .filter((o) => /^[\w.-]+$/.test(o) && !ordenesEnTablero.has(o)),
    ),
  ];
  const listaHistorialIn = ordenesHistorial.length
    ? ordenesHistorial.map((o) => `'${o}'`).join(",")
    : "''";

  // Pedidos de venta reales presentes en la vista (para el contexto de venta).
  const codigosPedido = [
    ...new Set(
      vista.recordset
        .map((f) => (f.Pedido ?? "").trim())
        .filter((c) => /^AR\.\d{2}\.\d{5}$/.test(c)),
    ),
  ];
  const listaPedidosIn = codigosPedido.length
    ? codigosPedido.map((c) => `'${c}'`).join(",")
    : "''";

  const [fichajes, reservas, imputaciones, ventas, tareas, imputacionesHist] = await Promise.all([
    pool.request().query<FilaFichaje>(`
      SELECT orden, fase, tiempo, codoperario FROM dbo.tgm_fichajes_olanet
    `),
    // Reservas de material vivas, agrupadas por OF. La tabla de reservas es
    // pequeña: subir de reserva → material → tarea → OF es barato.
    pool.request().query<FilaReserva>(`
      SELECT mo.CodManufacturingOrder AS orden, COUNT(*) AS reservas
      FROM dbo.STKStockReserve r
      JOIN dbo.CPRMOMaterial m ON m.IDMOMaterial = r.IDItem
      JOIN dbo.CPRMOTask t ON t.IDMOTask = m.IDMOTask
      JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = t.IDManufacturingOrder
      WHERE r.ItemType = 5 AND mo.CodCompany = '001'
      GROUP BY mo.CodManufacturingOrder
    `),
    // Tiempo imputado por empleado en cada tarea de las OFs pendientes:
    // da el autor real (quién ha planteado) aunque nadie fiche ahora mismo.
    pool.request().query<FilaImputacion>(`
      SELECT mo.CodManufacturingOrder AS orden, t.CodMOTask AS tarea,
             e.CodEmployee AS empleado, SUM(i.ExecutionTime) AS minutos
      FROM dbo.CPRImputationMO i
      JOIN dbo.CPRManufacturingOrder mo
        ON mo.IDManufacturingOrder = i.IDManufacturingOrder AND mo.CodCompany = '001'
      JOIN dbo.CPRMOTask t ON t.IDMOTask = i.IDMOTask
      JOIN dbo.GENEmployee e ON e.IDEmployee = i.IDEmployeeMachineTool
      WHERE mo.CodManufacturingOrder IN (${listaIn})
      GROUP BY mo.CodManufacturingOrder, t.CodMOTask, e.CodEmployee
    `),
    // Contexto del pedido de venta: comentario, ciudad y fecha solicitada
    // (la de las líneas; la cabecera suele traer el centinela 1900-01-01).
    pool.request().query<FilaVenta>(`
      SELECT o.CodOrder AS pedido, o.Comment AS comentario,
             o.CityDelivery AS ciudad,
             (SELECT MIN(l.ReceptionDemandDate) FROM dbo.FACOrderLineSL l
              WHERE l.IDOrder = o.IDOrder
                AND l.ReceptionDemandDate > '2000-01-01') AS solicitada,
             d.Description AS negocio, o.OrderDate AS creacion
      FROM dbo.FACOrderSL o
      LEFT JOIN dbo.FACCustomerDeliveryAddress d
        ON d.IDCustomerDeliveryAddress = o.IDCustomerDeliveryAddress
      WHERE o.CodCompany = '001' AND o.CodOrder IN (${listaPedidosIn})
    `),
    // Ruta de tareas de cada OF pendiente: da los avisos de producción
    // (tareas-nota) y el arranque planificado de la fase posterior al planteo.
    pool.request().query<FilaTarea>(`
      SELECT mo.CodManufacturingOrder AS orden, t.CodMOTask AS codTarea,
             t.Description AS descripcion, t.PlannedStartDate AS planificada,
             t.Canceled AS cancelada
      FROM dbo.CPRMOTask t
      JOIN dbo.CPRManufacturingOrder mo
        ON mo.IDManufacturingOrder = t.IDManufacturingOrder AND mo.CodCompany = '001'
      WHERE mo.CodManufacturingOrder IN (${listaIn})
    `),
    // Autor real y minutos del historial (por OF, no hace falta por tarea:
    // ya viene filtrada a la fase de OT finalizada).
    pool.request().query<FilaImputacion>(`
      SELECT mo.CodManufacturingOrder AS orden, NULL AS tarea,
             e.CodEmployee AS empleado, SUM(i.ExecutionTime) AS minutos
      FROM dbo.CPRImputationMO i
      JOIN dbo.CPRManufacturingOrder mo
        ON mo.IDManufacturingOrder = i.IDManufacturingOrder AND mo.CodCompany = '001'
      JOIN dbo.GENEmployee e ON e.IDEmployee = i.IDEmployeeMachineTool
      WHERE mo.CodManufacturingOrder IN (${listaHistorialIn})
      GROUP BY mo.CodManufacturingOrder, e.CodEmployee
    `),
  ]);

  const ventaPorPedido = new Map(
    ventas.recordset.map((v) => [(v.pedido ?? "").trim(), v]),
  );

  const tareasPorOF = new Map<string, FilaTarea[]>();
  for (const t of tareas.recordset) {
    const orden = (t.orden ?? "").trim();
    const lista = tareasPorOF.get(orden) ?? [];
    lista.push(t);
    tareasPorOF.set(orden, lista);
  }

  const reservasPorOF = new Map(
    reservas.recordset.map((r) => [(r.orden ?? "").trim(), r.reservas]),
  );

  // Fichajes con intervalo abierto ahora mismo, por OF+tarea → operario del
  // tablero (null si ficha alguien de fuera de OT).
  const abiertos = new Map<string, string | null>(
    fichajes.recordset.map((f) => [
      `${(f.orden ?? "").trim()}:${(f.fase ?? "").trim()}`,
      operarioDeEmpleado(f.codoperario),
    ]),
  );

  // Por OF+tarea: minutos totales imputados (tiempo de planteo ya fichado,
  // la vista dejó de traerlo) y autor real (operario del tablero con más
  // minutos).
  const minutosPorTarea = new Map<string, number>();
  const autorPorTarea = new Map<string, { op: string; min: number }>();
  for (const r of imputaciones.recordset) {
    const clave = `${(r.orden ?? "").trim()}:${(r.tarea ?? "").trim()}`;
    const min = r.minutos ?? 0;
    minutosPorTarea.set(clave, (minutosPorTarea.get(clave) ?? 0) + min);
    const op = operarioDeEmpleado(r.empleado);
    if (!op) continue;
    const actual = autorPorTarea.get(clave);
    if (!actual || min > actual.min) autorPorTarea.set(clave, { op, min });
  }

  // Autor/minutos del historial, por OF (una sola fase de OT por OF).
  const minutosPorOFHist = new Map<string, number>();
  const autorPorOFHist = new Map<string, { op: string; min: number }>();
  for (const r of imputacionesHist.recordset) {
    const orden = (r.orden ?? "").trim();
    const min = r.minutos ?? 0;
    minutosPorOFHist.set(orden, (minutosPorOFHist.get(orden) ?? 0) + min);
    const op = operarioDeEmpleado(r.empleado);
    if (!op) continue;
    const actual = autorPorOFHist.get(orden);
    if (!actual || min > actual.min) autorPorOFHist.set(orden, { op, min });
  }

  // Una OF puede tener más de una fase de OT marcada finalizada en la
  // ventana de 60 días (raro, p.ej. si se replanteó): nos quedamos con la
  // más reciente.
  const historialPorOF = new Map<string, FilaHistorial>();
  for (const f of historialFin.recordset) {
    const orden = (f.orden ?? "").trim();
    if (!orden || ordenesEnTablero.has(orden)) continue;
    const actual = historialPorOF.get(orden);
    if (
      !actual ||
      (f.finalizada && (!actual.finalizada || f.finalizada > actual.finalizada))
    ) {
      historialPorOF.set(orden, f);
    }
  }

  // Agrupa el historial por pedido de venta (best-effort, ver comentario en
  // la query): sin vínculo fiable, la OF queda como pedido "suelto".
  const porPedidoHist = new Map<string, { codigo: string; filas: FilaHistorial[] }>();
  for (const fila of historialPorOF.values()) {
    const codigo = (fila.pedido ?? "").trim();
    const orden = (fila.orden ?? "").trim();
    const clave = codigo || `hist-suelta:${orden}`;
    const grupo = porPedidoHist.get(clave) ?? {
      codigo: codigo || `OF ${orden}`,
      filas: [],
    };
    grupo.filas.push(fila);
    porPedidoHist.set(clave, grupo);
  }

  const pedidosHistorial: Pedido[] = [...porPedidoHist.entries()].map(([clave, grupo]) => {
    const filas = grupo.filas;
    const cliente =
      filas.map((f) => (f.cliente ?? "").trim()).find(Boolean) ?? "Sin cliente";
    const solicitada =
      filas.map((f) => fechaISO(f.solicitada)).find((d): d is string => d !== null) ??
      hoyISO();
    const creacionHist = filas
      .map((f) => fechaISO(f.creacion))
      .find((d): d is string => d !== null);
    // No hay fecha de planificación/entrega real para un pedido ya
    // finalizado en OT: se usa la fecha en que se terminó el planteo.
    const finalizadaISO =
      filas
        .map((f) => fechaISO(f.finalizada))
        .filter((d): d is string => d !== null)
        .sort()
        .at(-1) ?? hoyISO();
    const scanUrl = /^AR\.\d{2}\.\d{5}$/.test(grupo.codigo)
      ? `/api/pedidos/${grupo.codigo}.pdf`
      : undefined;
    return {
      id: `hist:${clave}`,
      codigo: grupo.codigo,
      cliente,
      situacion: "completado",
      fechaSolicitud: solicitada,
      fechaCreacion: creacionHist,
      fechaPlanificacion: finalizadaISO,
      fechaEntrega: finalizadaISO,
      // Sin dato de prioridad para un pedido ya terminado: normal por defecto.
      prioridad: 2,
      scanUrl,
      ofs: filas.map((f) => {
        const orden = (f.orden ?? "").trim();
        return aOFHistorial(
          f,
          minutosPorOFHist.get(orden) ?? 0,
          autorPorOFHist.get(orden)?.op ?? null,
        );
      }),
      accent: "ninguno",
      lineas: 0,
      croquis: false,
    };
  });

  // Agrupa filas (OFs) por pedido. Una OF sin pedido va en un pedido sintético
  // propio: sigue siendo trabajo real de OT y debe verse en el tablero.
  const porPedido = new Map<string, { codigo: string; filas: FilaVista[] }>();
  for (const fila of vista.recordset) {
    if (!fila.OF?.trim()) continue; // fila inservible: sin nº de OF
    const codigo = fila.Pedido?.trim() || "";
    const clave = codigo || `sin-pedido:${fila.OF.trim()}`;
    const grupo = porPedido.get(clave) ?? {
      codigo: codigo || `OF ${fila.OF.trim()}`,
      filas: [],
    };
    grupo.filas.push(fila);
    porPedido.set(clave, grupo);
  }

  const pedidos: Pedido[] = [...porPedido.entries()].map(([clave, grupo]) => {
    const filas = grupo.filas;
    const cliente =
      filas.map((f) => (f.Cliente ?? "").trim()).find(Boolean) ?? "Sin cliente";
    const validas = (ds: (Date | null)[]) =>
      ds.map(fechaISO).filter((f): f is string => f !== null).sort();
    const venta = ventaPorPedido.get(grupo.codigo);
    // Fecha solicitada por el cliente: la más temprana de la vista o, si la
    // vista trae el centinela (pasa), la de las líneas del pedido de venta
    // (la "Fecha solicitada" del parte escaneado). Último recurso: hoy.
    const fecha =
      validas(filas.map((f) => f.FechaSolicitada))[0] ??
      fechaISO(venta?.solicitada ?? null) ??
      hoyISO();
    // Planificación = FechaPlanificada de la vista (la de la tarea de OT);
    // si falta, el arranque planificado de la OF. Entrega = fin planificado
    // más tardío. Último recurso en ambas: la fecha solicitada.
    const planificacion =
      validas(filas.map((f) => f.FechaPlanificada))[0] ??
      validas(filas.map((f) => f.PlannedStartDate))[0] ??
      fecha;
    const entrega =
      validas(filas.map((f) => f.PlannedEndDate)).at(-1) ?? fecha;
    // El pedido hereda la MÁS urgente de sus OFs: con la escala nueva (3 =
    // urgente) eso es el máximo, no el mínimo.
    const prioridad = filas
      .map((f) => prioridadDe(f.Prioridad))
      .reduce<Prioridad>((a, b) => (b > a ? b : a), 1);

    // El PDF escaneado existe para los pedidos de venta reales (AR.aa.nnnnn);
    // el endpoint responde 404 si falta y la tarjeta enseña la réplica.
    const scanUrl = /^AR\.\d{2}\.\d{5}$/.test(grupo.codigo)
      ? `/api/pedidos/${grupo.codigo}.pdf`
      : undefined;

    return {
      id: clave,
      codigo: grupo.codigo,
      cliente,
      // Sin pedido de venta = proyecto interno (desarrollos, mantenimiento):
      // se ficha, pero no entra en el tablero de asignación.
      interno: clave.startsWith("sin-pedido:") || undefined,
      situacion: "procesado", // la vista ya es solo trabajo pendiente de OT
      fechaSolicitud: fecha,
      fechaCreacion: fechaISO(venta?.creacion ?? null) ?? undefined,
      fechaPlanificacion: planificacion,
      fechaEntrega: entrega,
      prioridad,
      scanUrl,
      comentarioVenta: (venta?.comentario ?? "").trim() || undefined,
      ciudadEntrega: (venta?.ciudad ?? "").trim() || undefined,
      negocio: (venta?.negocio ?? "").trim() || undefined,
      ofs: filas.map((f) => {
        const orden = (f.OF ?? "").trim();
        const codTareaOT = (f.CodTarea ?? "").trim();
        const clave = `${orden}:${codTareaOT}`;
        const ruta = tareasPorOF.get(orden) ?? [];
        const avisos = [
          ...new Set(
            ruta
              .map((t) => (t.descripcion ?? "").trim())
              .filter((d) => d && esNota(d)),
          ),
        ];
        // Primera fase de producción tras el planteo: tareas reales (ni la
        // propia de OT, ni notas, ni canceladas) con fecha planificada válida.
        const fechaLimitePlanteo = ruta
          .filter(
            (t) =>
              !t.cancelada &&
              (t.codTarea ?? "").trim() !== codTareaOT &&
              !esNota((t.descripcion ?? "").trim()),
          )
          .map((t) => fechaISO(t.planificada))
          .filter((d): d is string => d !== null)
          .sort()[0];
        return aOF(f, {
          fichandoOperario: abiertos.has(clave) ? abiertos.get(clave)! : undefined,
          reservas: reservasPorOF.get(orden) ?? 0,
          autorImputado: autorPorTarea.get(clave)?.op ?? null,
          minutosImputados: minutosPorTarea.get(clave) ?? 0,
          avisos,
          fechaLimitePlanteo,
        });
      }),
      accent: "ninguno",
      lineas: 0,
      croquis: false,
    };
  });

  return { operarios: OPERARIOS, pedidos: [...pedidos, ...pedidosHistorial] };
}

// ─── Caché con TTL y deduplicación de consultas en vuelo ─────────────────────

let cache: { data: Tablero; at: number } | null = null;
let enVuelo: Promise<Tablero> | null = null;

export async function getTableroRPS(): Promise<Tablero> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  if (!enVuelo) {
    enVuelo = consultarTablero()
      .then((data) => {
        cache = { data, at: Date.now() };
        return data;
      })
      .finally(() => {
        enVuelo = null;
      });
  }
  // Si hay caché caducada y falla la consulta, mejor dato viejo que error.
  return enVuelo.catch((e) => {
    if (cache) return cache.data;
    throw e;
  });
}
