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
}

interface FilaTarea {
  orden: string | null;
  codTarea: string | null;
  descripcion: string | null;
  planificada: Date | null;
  cancelada: boolean | null;
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
function familiaDe(fila: FilaVista): Familia {
  const grupo = textoArticulo(fila.Articulo).toUpperCase();
  const desc = (fila.DescripcionMO ?? "").toUpperCase();
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

function prioridadDe(n: number | null): Prioridad {
  return n === 1 || n === 2 || n === 3 ? n : 3;
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

// ─── Consulta + agrupado ─────────────────────────────────────────────────────

async function consultarTablero(): Promise<Tablero> {
  const { getPool } = await import("./db");
  const pool = await getPool();

  // La vista va primero (es LA consulta cara y da la lista de OFs pendientes);
  // el resto de datos auxiliares se piden en paralelo contra tablas indexadas.
  const vista = await pool.request().query<FilaVista>(`
    SELECT v.[OF], v.CodTarea, v.Tarea, v.Pedido, v.Cliente, v.Articulo,
           v.Rotulacion, v.FechaSolicitada, v.Prioridad, v.TiempoPrevisto,
           v.FechaCompras, v.FechaPlanificada, v.SitOF, v.NotasOF,
           mo.Description AS DescripcionMO, mo.Quantity AS Cantidad,
           mo.PlannedStartDate, mo.PlannedEndDate
    FROM dbo.TGM_PENDIENTE_OT v
    LEFT JOIN dbo.CPRManufacturingOrder mo
      ON mo.CodManufacturingOrder = v.[OF] AND mo.CodCompany = '001'
  `);

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

  const [fichajes, reservas, imputaciones, ventas, tareas] = await Promise.all([
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
             d.Description AS negocio
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
    const prioridad = filas
      .map((f) => prioridadDe(f.Prioridad))
      .reduce<Prioridad>((a, b) => (b < a ? b : a), 3);

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

  return { operarios: OPERARIOS, pedidos };
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
