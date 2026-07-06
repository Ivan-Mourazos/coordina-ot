import type { Tablero } from "../data";
import type { Familia, OF, Pedido, Prioridad } from "../types";
import { hoyISO } from "../types";
import { OPERARIOS } from "../mock";

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
  PedComprasPendiente: string | null;
  TiempoTotalFichado: number | null;
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
}

interface FilaReserva {
  orden: string | null;
  reservas: number;
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

/** "08/07/2026" (PedComprasPendiente) → "2026-07-08". Formato raro → undefined. */
function fechaComprasISO(v: string | null): string | undefined {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((v ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
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

function aOF(fila: FilaVista, fichadaAhora: boolean, reservas: number): OF {
  const orden = (fila.OF ?? "").trim();
  const fichadoMin = fila.TiempoTotalFichado ?? 0;
  const sit = (fila.SitOF ?? "").trim().toUpperCase();
  return {
    id: `${orden}:${(fila.CodTarea ?? "").trim()}`,
    codigo: orden,
    descripcion: descripcionDe(fila),
    familia: familiaDe(fila),
    piezas: Math.max(1, Math.round(fila.Cantidad ?? 1)),
    autorId: null, // la asignación no vive en RPS (se hace en el tablero)
    revisorId: null,
    // El fichaje del terminal de RPS solo cubre el planteo; la revisión es
    // propia de CoordinaOT y aún no existe en origen.
    estado: fichadaAhora || fichadoMin > 0 ? "en_curso" : "pendiente",
    fichandoRol: fichadaAhora ? "plantear" : null,
    detenida: sit === "DETENIDA",
    fichable: SITUACIONES_FICHABLES.has(sit),
    rotulacion: (fila.Rotulacion ?? "").trim() || undefined,
    materialPendienteHasta: fechaComprasISO(fila.PedComprasPendiente),
    reservasMaterial: reservas,
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

  const [vista, fichajes, reservas] = await Promise.all([
    pool.request().query<FilaVista>(`
      SELECT v.[OF], v.CodTarea, v.Tarea, v.Pedido, v.Cliente, v.Articulo,
             v.Rotulacion, v.FechaSolicitada, v.Prioridad, v.TiempoPrevisto,
             v.PedComprasPendiente, v.TiempoTotalFichado, v.SitOF, v.NotasOF,
             mo.Description AS DescripcionMO, mo.Quantity AS Cantidad,
             mo.PlannedStartDate, mo.PlannedEndDate
      FROM dbo.TGM_PENDIENTE_OT v
      LEFT JOIN dbo.CPRManufacturingOrder mo
        ON mo.CodManufacturingOrder = v.[OF] AND mo.CodCompany = '001'
    `),
    pool.request().query<FilaFichaje>(`
      SELECT orden, fase, tiempo FROM dbo.tgm_fichajes_olanet
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
  ]);

  const reservasPorOF = new Map(
    reservas.recordset.map((r) => [(r.orden ?? "").trim(), r.reservas]),
  );

  // Fichajes con intervalo abierto ahora mismo, por OF+tarea.
  const abiertos = new Set(
    fichajes.recordset.map(
      (f) => `${(f.orden ?? "").trim()}:${(f.fase ?? "").trim()}`,
    ),
  );

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
    // Fecha solicitada más temprana del grupo; prioridad más urgente (menor).
    const fecha = validas(filas.map((f) => f.FechaSolicitada))[0] ?? hoyISO();
    // Planificación = arranque planificado más temprano de las OF del pedido;
    // entrega = fin planificado más tardío. Si RPS no los trae, la solicitada.
    const planificacion =
      validas(filas.map((f) => f.PlannedStartDate))[0] ?? fecha;
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
      situacion: "procesado", // la vista ya es solo trabajo pendiente de OT
      fechaSolicitud: fecha,
      fechaPlanificacion: planificacion,
      fechaEntrega: entrega,
      prioridad,
      scanUrl,
      ofs: filas.map((f) => {
        const orden = (f.OF ?? "").trim();
        return aOF(
          f,
          abiertos.has(`${orden}:${(f.CodTarea ?? "").trim()}`),
          reservasPorOF.get(orden) ?? 0,
        );
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
