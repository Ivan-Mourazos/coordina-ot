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
  /** Bit de la vista: la situación de la OF admite imputaciones. */
  PermiteImputaciones?: boolean | number | null;
  NotasOF: string | null;
  // De CPRManufacturingOrder (JOIN por CodManufacturingOrder, empresa 001):
  DescripcionMO: string | null;
  Cantidad: number | null;
  PlannedStartDate: Date | null;
  PlannedEndDate: Date | null;
  ManualEndDate: Date | null;
}

interface FilaFichaje {
  orden: string | null;
  fase: string | null;
  tiempo: number | null;
  codoperario: number | null;
}

interface FilaReserva {
  orden: string | null;
  material: string | null;
  cantidad: number | null;
}

interface FilaImputacion {
  orden: string | null;
  tarea: string | null;
  empleado: string | null;
  minutos: number | null;
  /** Primera fecha en la que ESE empleado imputó tiempo en la tarea. Opcional
   *  porque la query del historial no la pide (allí no se usa). */
  desde?: Date | null;
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
  /** Cuándo se creó la OF en RPS: el día en que el trabajo llega a Oficina
   *  Técnica, que no es el mismo en que el cliente hizo el pedido. */
  ofCreada: Date | null;
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
  comentario: string | null;
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
/** Grupos de artículo de RPS que ya dicen por sí solos de qué familia es.
 *
 *  Van ANTES que la descripción porque son la clasificación oficial y la
 *  descripción engaña: "LONA SEPARA MERCANCIAS" de un camión acababa en Lona
 *  cuando es un remolque, y por eso los remolques no aparecían en el filtro. */
const FAMILIA_POR_GRUPO: [RegExp, Familia][] = [
  // CAMION va aparte de REMOLQUE. Los dos son transporte, pero no son el mismo
  // trabajo, y meterlos juntos hacía que un camión saliera bajo "Remolque".
  // RPS ya los tiene separados en su catálogo (grupos CAMION y CAPOTA); éramos
  // nosotros los que los juntábamos.
  [/CAMION/, "CAMION"],
  [/CAPOTA/, "REMOLQUE"],
  [/TOLDO/, "TOLDO"],
  [/ESPECTACULO/, "ESPECTACULO"],
  [/CARPA/, "CARPA"],
  [/SUMINISTRO/, "SUMINISTRO"],
];

/** Clientes que en la práctica SON una familia.
 *
 *  No es una rareza del programa: hay clientes de los que entra trabajo
 *  continuamente y siempre del mismo tipo, y en la oficina se habla de ellos
 *  por su nombre, no por lo que fabrican ("los de Assa Abloy"). Agruparlos con
 *  el resto de "Suministro" —donde cae de todo— los escondía entre cosas que no
 *  tienen nada que ver.
 *
 *  Manda sobre todo lo demás, a propósito: si el pedido es de uno de estos, eso
 *  es lo primero que se quiere saber. Para añadir otro basta una línea. */
const CLIENTES_FAMILIA: [RegExp, Familia][] = [
  // Los tres tienen varias razones sociales en RPS, y por eso se buscan por el
  // nombre y no por código de cliente. Pedidos históricos a 11/08/2026:
  //   ASSA ABLOY … ROMANIA SRL 1692, … SPAIN 1271 (y "PRDUCTION", con la errata
  //   de RPS), … SYSTEM SPAIN S.A. 46
  [/\bASSA\s*ABLOY\b/, "ASSAABLOY"],
  //   CCI CARROCERIAS INTELIGENTES S.L. 1101. Se pide el nombre entero: hay dos
  //   docenas de "CARROCERIAS <algo>" que no son este cliente, y bastaría con
  //   buscar "CARROCERIAS" para meterlos a todos en el mismo saco.
  [/CARROCER[IÍ]AS?\s+INTELIGENTES/, "CCI"],
  //   LAYHER, S. A. 250 y LAYHER IBERICA S.L. 87
  [/\bLAYHER\b/, "LAYHER"],
];

/** Y por descripción, con el vocabulario del taller (acordado con Iván): los
 *  toldos incluyen cortinas, bambalinas y cambios de tela; los remolques,
 *  arquillados, baquetones y tautliners; las lonas, las de estructura, riel y
 *  ollaos. Lo específico va primero: "lona de tautliner" es un remolque. */
const FAMILIA_POR_TEXTO: [RegExp, Familia][] = [
  // Transporte. Va lo primero porque casi todo esto se describe empezando por
  // "LONA…" y si no, acabaría en lonas. Las tildes se contemplan a mano:
  // toUpperCase() no las quita, y en RPS conviven "BAQUETON" y "BAQUETÓN".
  [
    /TAUT?LINER|ARQUILLAD|BAQUET[OÓ]N|REMOLQUE|CAMI[OÓ]N|CAPOTA|BOTELLERO|CISTERNA|GANADO|CABALLO/,
    "REMOLQUE",
  ],
  [/FUNDA/, "FUNDA"],
  [/PUERTA R[AÁ]PIDA|APILABLE|ENROLLABLE|AUTOREPARABLE|AUTORREPARABLE/, "PUERTA"],
  [/ORQUESTA|ESPECTACULO|ESCENARIO/, "ESPECTACULO"],
  // "Cortina" sirve para las dos cosas, y lo que decide es con qué va (Iván):
  // un toldo cortina y un cambio de tela de cortina son TOLDO, pero una
  // cortina de lona con riel es LONA. Va antes que la regla de toldo, y mira
  // los dos órdenes: en RPS aparece igual "LONA CORTINA…" que "CORTINA LONA…".
  [/CORTINA(?!.*(?:TOLDO|CAMBIO DE TELA)).*(?:LONA|RIEL)|(?:LONA|RIEL).*CORTINA/, "LONA"],
  [
    /TOLDO|CORTINA|ARZ[UÚ]A|BAMBALINA|CAMBIO DE TELA|CAMBIAR TELA|PROTECCI[OÓ]N SOLAR/,
    "TOLDO",
  ],
  [/CARPA/, "CARPA"],
  [/TAPIZ/, "TAPIZADO"],
  [/REPARAC/, "REPARACION"],
  [/SUMINISTRO|SYSTEM DOCK/, "SUMINISTRO"],
  [/LONA|ROLLO|OLLAO|RIEL/, "LONA"],
];

/** De qué es este trabajo, de lo más decisivo a lo más adivinado.
 *
 *  1. El CLIENTE, si es de los que valen por una familia.
 *  2. La SUBFAMILIA de RPS, que es el nivel al que de verdad se distingue el
 *     trabajo. Las familias de RPS son demasiado anchas para agrupar:
 *     "SUMINISTRO" mezcla 1313 puertas con 422 OF de material suelto, y
 *     "TOLDO FACHADA" mete en el mismo sitio 662 toldos nuevos, 700
 *     reparaciones y 163 accesorios (12 meses de trabajo de OT, 11/08/2026).
 *  3. Su familia, cuando el artículo no tiene subfamilia puesta (pasa: 450 OF
 *     de OTR.ESTRUCTURAS y 422 de SUMINISTRO no la tienen).
 *  4. Y al final la descripción, que es adivinar.
 *
 *  Aviso sobre 2: hay subfamilias que cuelgan de familias muy distintas y al
 *  agrupar por ellas se juntan trabajos que antes iban separados —LONASNUEVAS
 *  vive bajo REMOLQUE, CAMION, CARPAS, SUMINISTRO y AGRIGANA; CONFECCION bajo
 *  ESPECTACULO, SUMINISTRO, ACABADOS y más—. Es a propósito y es decisión de
 *  Iván: en la oficina el trabajo se llama por la subfamilia. */
export function familiaDeTexto(
  descripcionMO: string | null,
  articulo: string | null,
  extra?: { cliente?: string | null; subfamilia?: string | null },
): Familia {
  const grupo = textoArticulo(articulo).toUpperCase();
  const desc = (descripcionMO ?? "").toUpperCase();
  const cliente = (extra?.cliente ?? "").toUpperCase();
  const sub = (extra?.subfamilia ?? "").trim().toUpperCase();
  for (const [re, familia] of CLIENTES_FAMILIA) if (re.test(cliente)) return familia;
  if (sub) return sub;
  for (const [re, familia] of FAMILIA_POR_GRUPO) if (re.test(grupo)) return familia;
  for (const [re, familia] of FAMILIA_POR_TEXTO) if (re.test(desc)) return familia;
  // Nada reconocible: se deja el grupo tal cual y familiaMeta le da tinte
  // neutro. Mejor un nombre feo que meterlo en una familia que no es.
  return grupo || "OTRO";
}

function familiaDe(fila: FilaVista, subfamilia: string | undefined): Familia {
  return familiaDeTexto(fila.DescripcionMO, fila.Articulo, {
    cliente: fila.Cliente,
    subfamilia,
  });
}

/** ¿La tarea por la que esta OF entra en la vista es de TALLER y no de OT?
 *
 *  La vista `TGM_PENDIENTE_OT` filtra por el TEXTO de la tarea y deja pasar
 *  todo lo que empieza por "PLANTEAR", así que por ahí entran las capotas y
 *  los faldones, que los plantea el taller. Verificado sobre las 106 filas:
 *  las de OT son "PLANTEAR Y PREPARAR ARCHIVO(S) MAQ. DE CORTE",
 *  "PLANTEAMIENTO EN OFICINA TECNICA" y "PLANTEAR" a secas; las ajenas dicen
 *  "PLANTEAR EN TALLER".
 *
 *  Sí, distinguirlas por texto es frágil, y se sabe: se comprobaron las dos
 *  alternativas y ninguna sirve. Ninguna tarea tiene máquina asignada
 *  (`IDBudgetMachine` vacío en las 106) y el catálogo tampoco discrimina (la
 *  misma descripción aparece con y sin `IDUsualTask`). Por eso estas OF no se
 *  descartan: se marcan, y basta con asignarles autor para recuperarlas. */
export function esTareaDeTaller(tarea: string | null): boolean {
  return /\bTALLER\b/.test((tarea ?? "").toUpperCase());
}

/** Una fila por OF, no una por TAREA.
 *
 *  La vista da una fila por cada tarea pendiente, así que una OF con dos tareas
 *  sale dos veces. Pasa de verdad: en AR.26.03626 la OF 0230700 aparecía
 *  repetida, una vez por su tarea de Oficina Técnica y otra por una de taller.
 *  Es la misma orden de fabricación —mismas piezas, mismas fechas, misma
 *  situación—, y contarla dos veces hinchaba el nº de OF del pedido y obligaba
 *  a mirar las dos para descubrir que decían lo mismo.
 *
 *  Gana la tarea de OT: es la que decide si el trabajo es nuestro y la que da
 *  el CodTarea con el que se imputa. Si TODAS son de taller se queda la
 *  primera, y la OF sigue marcada como ajena a OT (que es lo cierto).
 *
 *  Lo que no comparten las filas es de la tarea, no de la OF (descripción de la
 *  MO, tiempo previsto), así que no hay nada que sumar al fusionar: el tiempo
 *  previsto de una tarea de taller no es tiempo de Oficina Técnica. */
export function unaFilaPorOF<T extends { OF: string | null; Tarea: string | null }>(
  filas: readonly T[],
): T[] {
  const porOF = new Map<string, T>();
  for (const f of filas) {
    const ya = porOF.get((f.OF ?? "").trim());
    if (!ya || (esTareaDeTaller(ya.Tarea) && !esTareaDeTaller(f.Tarea))) {
      porOF.set((f.OF ?? "").trim(), f);
    }
  }
  return [...porOF.values()];
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
/** Trabajo de la casa para la casa: el "cliente" es Toldos Gómez.
 *
 *  Hay dos formas de que un trabajo sea interno y solo una salta a la vista.
 *  La conocida es no tener pedido de venta. La otra es tenerlo pero a nombre
 *  de la propia empresa, y esos venían colándose en la lista de pedidos como
 *  si fueran de un cliente: en la vista real son AR.24.06449, AR.24.06685,
 *  AR.25.00124 y AR.25.05590 — los cuatro más viejos de todos, con más de un
 *  año de retraso aparente que no era tal.
 *
 *  Se mira el CLIENTE y no la descripción a propósito: dos de esos cuatro son
 *  "MUESTRA LONA" y "BAMBALINA NUEVA", que no dicen mantenimiento por ninguna
 *  parte y son igual de internos. */
export function esTrabajoInterno(cliente: string): boolean {
  return /TOLDOS\s*G[OÓ]MEZ|(^|\W)TGM(\W|$)/i.test(cliente);
}

function fechaISO(d: Date | null): string | null {
  if (!d || Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** El día en que se tocó por primera vez una OF, a partir de las fechas que
 *  devuelve la query de imputaciones (una por empleado que le echó tiempo).
 *
 *  Hay que quedarse con la MÁS TEMPRANA de todas, no con la de la primera fila
 *  que salga: la query agrupa por empleado y el orden en que llegan las filas
 *  no lo decide nadie, así que si Ana empezó en marzo y Luis en julio, leer la
 *  fila de Luis diría que la OF se empezó en julio.
 *
 *  Las fechas inservibles se caen por `fechaISO` (null, centinela 1900 de RPS);
 *  las del futuro las descarta ya la query. Sin ninguna válida → undefined,
 *  que es lo que el contrato entiende por "nunca se le imputó tiempo". */
export function primeraImputacion(fechas: (Date | null | undefined)[]): string | undefined {
  return fechas
    .map((d) => fechaISO(d ?? null))
    .filter((d): d is string => d !== null)
    .sort()[0];
}

/** Respaldo de `PermiteImputaciones` para cuando la vista no lo traiga (una
 *  versión anterior, o la fila sin valor). Son las situaciones que hoy tienen
 *  AllowImputations en CPRManufacturingOrderSituation; si IT añade una nueva,
 *  la columna de la vista se entera y esta lista no, así que solo se usa como
 *  último recurso. Fichar fuera de estas = tiempo que NO sube a RPS. */
const SITUACIONES_FICHABLES = new Set([
  "LANZADA",
  "IMPRESA",
  "CON IMPUTACIONES",
]);

/** ¿Se puede imputar tiempo en esta OF? Manda la columna `PermiteImputaciones`
 *  de la vista (bit, creada por IT el 2026-08-04 a petición nuestra); solo si
 *  falta se deduce de la situación. */
function permiteImputaciones(fila: FilaVista): boolean {
  if (typeof fila.PermiteImputaciones === "boolean") return fila.PermiteImputaciones;
  if (fila.PermiteImputaciones === 1 || fila.PermiteImputaciones === 0) {
    return fila.PermiteImputaciones === 1;
  }
  return SITUACIONES_FICHABLES.has((fila.SitOF ?? "").trim().toUpperCase());
}

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
  reservas: string[];
  /** Operario del tablero con más tiempo imputado en la tarea (autor real). */
  autorImputado: string | null;
  /** Minutos imputados en la tarea de OT (todos los empleados). */
  minutosImputados: number;
  /** Tareas-nota de la ruta ("22/06 VISITA MEDIR"). */
  avisos: string[];
  /** Arranque planificado de la primera fase de producción tras el planteo. */
  fechaLimitePlanteo: string | undefined;
  /** Día de la primera imputación de tiempo en RPS (undefined = ninguna). */
  fichadaDesde: string | undefined;
  /** Subfamilia del artículo en RPS (CodProductSubFamily). Afina la familia
   *  donde el catálogo de RPS la deja corta; ver FAMILIA_POR_SUBFAMILIA. */
  subfamilia: string | undefined;
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
    familia: familiaDe(fila, datos.subfamilia),
    subfamilia: datos.subfamilia,
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
    fichable: permiteImputaciones(fila),
    ajenaOT: esTareaDeTaller(fila.Tarea),
    rotulacion: (fila.Rotulacion ?? "").trim() || undefined,
    materialPendienteHasta: fechaISO(fila.FechaCompras) ?? undefined,
    reservasMaterial: datos.reservas.length,
    reservasDetalle: datos.reservas.length ? datos.reservas : undefined,
    avisos: datos.avisos.length ? datos.avisos : undefined,
    fechaLimitePlanteo: datos.fechaLimitePlanteo,
    fichadaDesde: datos.fichadaDesde,
    tiempoEstimadoMin: fila.TiempoPrevisto ?? 0,
    tiempoPlanteoMin: fichadoMin,
    tiempoRevisionMin: 0,
    observacion: (fila.NotasOF ?? "").trim() || undefined,
  };
}

/** OF ya finalizada en OT (Historial): no hay fichaje vivo ni situación RPS
 *  que consultar, así que se rellena lo mínimo con lo que da la query. */
interface ExtrasOF {
  reservas: string[];
  avisos: string[];
}

function aOFHistorial(
  fila: FilaHistorial,
  minutosImputados: number,
  autorImputado: string | null,
  extras: ExtrasOF,
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
    reservasMaterial: extras.reservas.length,
    reservasDetalle: extras.reservas.length ? extras.reservas : undefined,
    avisos: extras.avisos.length ? extras.avisos : undefined,
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
             v.FechaCompras, v.FechaPlanificada, v.SitOF, v.PermiteImputaciones, v.NotasOF,
             mo.Description AS DescripcionMO, mo.Quantity AS Cantidad,
             mo.PlannedStartDate, mo.PlannedEndDate, mo.ManualEndDate
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
        -- La ventana vuelve a 60 días porque ya da igual cuál sea: lo que
        -- sale de aquí no llega al tablero (ver el return de la función). Se
        -- deja corta para que la consulta sea barata mientras se quita.
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
               l.ReceptionDemandDate AS solicitada, o.Comment AS comentario
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

  // Ruta de tareas: se piden para pendientes + historial (avisos de producción
  // en ambas vistas). Reservas de material ya se traen para todas las OFs.
  const listaTareasIn =
    [...new Set([...ordenes, ...ordenesHistorial])]
      .map((o) => `'${o}'`)
      .join(",") || "''";

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

  const [fichajes, reservas, imputaciones, ventas, tareas, imputacionesHist, subfamilias] =
    await Promise.all([
    pool.request().query<FilaFichaje>(`
      SELECT orden, fase, tiempo, codoperario FROM dbo.tgm_fichajes_olanet
    `),
    // Reservas de material vivas (una fila por material reservado). La tabla
    // es pequeña: subir de reserva → material → tarea → OF es barato.
    pool.request().query<FilaReserva>(`
      SELECT mo.CodManufacturingOrder AS orden, m.Description AS material,
             r.Quantity AS cantidad
      FROM dbo.STKStockReserve r
      JOIN dbo.CPRMOMaterial m ON m.IDMOMaterial = r.IDItem
      JOIN dbo.CPRMOTask t ON t.IDMOTask = m.IDMOTask
      JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = t.IDManufacturingOrder
      WHERE r.ItemType = 5 AND mo.CodCompany = '001'
    `),
    // Tiempo imputado por empleado en cada tarea de las OFs pendientes:
    // da el autor real (quién ha planteado) aunque nadie fiche ahora mismo, y
    // el DÍA en que se tocó por primera vez (`fichadaDesde`).
    //
    // La fecha va aquí, colgada de la query que ya existía, y no en una consulta
    // propia: son las mismas filas de las que ya salen los minutos, así que el
    // dato es gratis y además no puede contradecir a `tiempoPlanteoMin`.
    // Medido en vivo contra RPS (08/2026, 4 pasadas alternas sobre las 111 OFs
    // de la vista): 54 ms de media antes y 54 después — en régimen, 31-33 ms
    // frente a 32-45. El tablero entero, 3 pasadas alternas de punta a punta:
    // 3788 ms antes y 3552 después (la diferencia es el arranque en frío de la
    // primera pasada; la vista pesada se lleva ~3,5 s de los dos). Es decir:
    // no cuesta nada, que era la condición para traerlo.
    //
    // `ImputationDate` y no `CreationTimestamp`: la primera no falta nunca
    // (0 nulos y 0 centinelas en las 136 328 imputaciones de OT) y la segunda
    // está vacía en 77 253 de ellas, justo en las viejas — que son las que
    // interesan. Guarda contra el futuro porque RPS acepta años mal tecleados:
    // hay 7 filas de 153 776 con fechas de 2062, 2105 y 2201, y bastaría una
    // en una OF sin más imputaciones para que el panel dijera "fichada desde
    // 2201". El CASE solo tapa la fecha: los minutos se siguen sumando todos, y
    // comprobado sobre la vista real (86 filas) no deja sin fecha ni una sola
    // fila que tenga minutos.
    //
    // Lo que se gana, medido el mismo día: de las 116 filas de la vista, 23
    // tienen tiempo imputado y las 23 reciben fecha; 6 de ellas se empezaron
    // antes de julio y hoy mienten con un "Aún sin fichar" — la más sangrante
    // es 0217537, con 23 horas encima desde el 10/10/2025.
    pool.request().query<FilaImputacion>(`
      SELECT mo.CodManufacturingOrder AS orden, t.CodMOTask AS tarea,
             e.CodEmployee AS empleado, SUM(i.ExecutionTime) AS minutos,
             MIN(CASE WHEN i.ImputationDate <= GETDATE() THEN i.ImputationDate END) AS desde
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
             t.Canceled AS cancelada, mo.CreationTimestamp AS ofCreada
      FROM dbo.CPRMOTask t
      JOIN dbo.CPRManufacturingOrder mo
        ON mo.IDManufacturingOrder = t.IDManufacturingOrder AND mo.CodCompany = '001'
      WHERE mo.CodManufacturingOrder IN (${listaTareasIn})
    `),
    // Autor real y minutos del historial: SOLO la tarea de Oficina Técnica
    // (recurso a-otec/otec-a). Sin este filtro se sumarían corte, soldadura,
    // confección… y el "planteo" saldría inflado (p.ej. 6 min reales → 5 h).
    pool.request().query<FilaImputacion>(`
      SELECT mo.CodManufacturingOrder AS orden, NULL AS tarea,
             e.CodEmployee AS empleado, SUM(i.ExecutionTime) AS minutos
      FROM dbo.CPRImputationMO i
      JOIN dbo.CPRManufacturingOrder mo
        ON mo.IDManufacturingOrder = i.IDManufacturingOrder AND mo.CodCompany = '001'
      JOIN dbo.CPRMOTask t ON t.IDMOTask = i.IDMOTask
      JOIN dbo.GENEmployee e ON e.IDEmployee = i.IDEmployeeMachineTool
      WHERE mo.CodManufacturingOrder IN (${listaHistorialIn})
        AND EXISTS (
          SELECT 1 FROM dbo.CPRMOResourceMachine rm
          WHERE rm.IDMOTask = t.IDMOTask
            AND rm.CodMOResourceMachine IN ('a-otec', 'otec-a')
        )
      GROUP BY mo.CodManufacturingOrder, e.CodEmployee
    `),
    // Subfamilia del artículo de cada OF. La vista no la trae: su `Articulo` es
    // `cantidad - CodProductFamily`, y la familia sola se queda corta donde el
    // catálogo de RPS mete cosas dispares ("SUMINISTRO" son puertas rápidas y
    // material suelto en el mismo saco).
    //
    // Va en consulta aparte y AGREGADA (`MAX`) a propósito: una OF puede
    // colgar de varias líneas de pedido, y repetir aquí el JOIN de la vista
    // multiplicaría las filas del tablero. Agrupando por OF no hay forma de que
    // eso pase. Medido: 380 ms para 17 283 OF de los últimos 18 meses, en
    // paralelo con las demás.
    pool.request().query<{ orden: string | null; subfamilia: string | null }>(`
      SELECT mo.CodManufacturingOrder AS orden,
             MAX(sf.CodProductSubFamily) AS subfamilia
      FROM dbo.CPRManufacturingOrder mo WITH (NOLOCK)
      JOIN dbo.FACOrderLineSL l WITH (NOLOCK)
        ON l.IDManufacturingOrder = mo.IDManufacturingOrder
      JOIN dbo.STKArticle art WITH (NOLOCK) ON art.IDArticle = l.IDArticle
      LEFT JOIN dbo.GENProductSubFamily sf WITH (NOLOCK)
        ON sf.IDProductSubFamily = art.IDProductSubFamily
      WHERE mo.CodCompany = '001'
        AND mo.CodManufacturingOrder IN (${listaTareasIn})
      GROUP BY mo.CodManufacturingOrder
    `),
  ]);

  const subfamiliaPorOF = new Map(
    subfamilias.recordset
      .map((s) => [(s.orden ?? "").trim(), (s.subfamilia ?? "").trim()] as const)
      .filter(([, sub]) => sub !== ""),
  );

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

  /** Avisos de producción (tareas-nota "22/06 VISITA MEDIR") de una OF. */
  const avisosDe = (orden: string): string[] => [
    ...new Set(
      (tareasPorOF.get(orden) ?? [])
        .map((t) => (t.descripcion ?? "").trim())
        .filter((d) => d && esNota(d)),
    ),
  ];

  // Reservas por OF: nº y lista legible "MATERIAL · cantidad".
  const reservasPorOF = new Map<string, string[]>();
  for (const r of reservas.recordset) {
    const orden = (r.orden ?? "").trim();
    if (!orden) continue;
    const mat = (r.material ?? "").trim().replace(/\s+/g, " ");
    const cant = r.cantidad != null ? ` · ${r.cantidad}` : "";
    const lista = reservasPorOF.get(orden) ?? [];
    lista.push(mat ? `${mat}${cant}` : `(material sin nombre)${cant}`);
    reservasPorOF.set(orden, lista);
  }

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
  // Fechas sueltas por OF+tarea: la query da una por empleado y la buena es la
  // más temprana de todas (ver `primeraImputacion`), así que se juntan antes de
  // decidir. Son 86 filas en la vista real: no compensa afinar más.
  const fechasPorTarea = new Map<string, (Date | null | undefined)[]>();
  for (const r of imputaciones.recordset) {
    const clave = `${(r.orden ?? "").trim()}:${(r.tarea ?? "").trim()}`;
    const min = r.minutos ?? 0;
    minutosPorTarea.set(clave, (minutosPorTarea.get(clave) ?? 0) + min);
    const suyas = fechasPorTarea.get(clave) ?? [];
    suyas.push(r.desde);
    fechasPorTarea.set(clave, suyas);
    const op = operarioDeEmpleado(r.empleado);
    if (!op) continue;
    const actual = autorPorTarea.get(clave);
    if (!actual || min > actual.min) autorPorTarea.set(clave, { op, min });
  }

  const desdePorTarea = new Map<string, string>();
  for (const [clave, fechas] of fechasPorTarea) {
    const desde = primeraImputacion(fechas);
    if (desde) desdePorTarea.set(clave, desde);
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
          { reservas: reservasPorOF.get(orden) ?? [], avisos: avisosDe(orden) },
        );
      }),
      comentarioVenta:
        filas.map((f) => (f.comentario ?? "").trim()).find(Boolean) || undefined,
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
    const filas = unaFilaPorOF(grupo.filas);
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
    // Las tres fechas con las que trabaja OT, con los nombres de la
    // herramienta vieja (verificado contra ella con AR.26.03926):
    //
    //   planificación → FechaPlanificada de la vista (el día de PLANTEAR)
    //   fabricación   → ManualEndDate de la OF (la que fija Producción)
    //   solicitada    → FechaSolicitada = la ENTREGA que pide el cliente
    //
    // La entrega es la solicitada, no PlannedEndDate: son cosas distintas y
    // pueden no coincidir (en AR.26.03926, 10/09 frente a 07/09).
    // Cuando RPS no da ninguna de las dos, la planificación NO se sabe. Se
    // sigue rellenando con la solicitada para que todo lo que ordena por esta
    // fecha siga funcionando, pero se marca como estimada: uno de cada cuatro
    // pedidos del tablero (25 de 93 el 10/08/2026) llega sin fecha planificada,
    // y darla por buena tenía dos efectos feos. En la línea de tiempo el hito
    // se iba al final, detrás de la fabricación, y parecía que las fechas
    // estaban mal metidas; y el pedido figuraba "a tiempo" hasta el día de la
    // entrega cuando en realidad nadie le había puesto fecha de planteo.
    const planificada =
      validas(filas.map((f) => f.FechaPlanificada))[0] ??
      validas(filas.map((f) => f.PlannedStartDate))[0];
    const planificacion = planificada ?? fecha;
    // Cuándo aterrizó en OT: la creación más temprana de sus OF. Sale de la
    // consulta de tareas, que ya recorre las mismas OF.
    const llegadaAOT = filas
      .map((f) => (f.OF ?? "").trim())
      .flatMap((orden) => (tareasPorOF.get(orden) ?? []).map((t) => t.ofCreada))
      .map((d) => fechaISO(d ?? null))
      .filter((d): d is string => d !== null)
      .sort()[0];
    // La más tardía: el pedido no está fabricado hasta que lo está su última OF.
    // ManualEndDate, no PlannedEndDate: en AR.26.03914 la herramienta vieja da
    // 17/08, que es ManualEndDate — PlannedEndDate vale 28/08. En AR.26.03926
    // las dos valen 07/09, así que ese pedido solo no distinguía cuál era.
    const fabricacion = validas(filas.map((f) => f.ManualEndDate)).at(-1);
    const entrega = fecha;
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
      // Trabajo interno (mantenimiento, muestras, desarrollos): se ficha, pero
      // no entra en el tablero de asignación.
      interno: clave.startsWith("sin-pedido:") || esTrabajoInterno(cliente) || undefined,
      situacion: "procesado", // la vista ya es solo trabajo pendiente de OT
      fechaSolicitud: fecha,
      // Cuándo llegó a OT, no cuándo lo pidió el cliente: son dos días
      // distintos y el que importa aquí es el primero. En AR.26.03947 el
      // pedido de venta es del 07/08 y sus OF se crearon el 10/08 — hasta ese
      // día el parte no existía para Oficina Técnica, así que arrancar el
      // recorrido tres días antes daba un retraso que nadie había tenido.
      // La MÁS TEMPRANA de sus OF: el trabajo llega cuando llega la primera.
      // Si RPS no la da (no debería), se cae a la fecha de venta.
      fechaCreacion: llegadaAOT ?? fechaISO(venta?.creacion ?? null) ?? undefined,
      fechaPlanificacion: planificacion,
      planificacionEstimada: planificada === undefined || undefined,
      fechaFabricacion: fabricacion,
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
        const avisos = avisosDe(orden);
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
          reservas: reservasPorOF.get(orden) ?? [],
          autorImputado: autorPorTarea.get(clave)?.op ?? null,
          minutosImputados: minutosPorTarea.get(clave) ?? 0,
          // Misma clave OF+tarea que los minutos: el "desde cuándo" y el
          // "cuánto llevas" hablan siempre del mismo trabajo.
          fichadaDesde: desdePorTarea.get(clave),
          subfamilia: subfamiliaPorOF.get(orden),
          avisos,
          fechaLimitePlanteo,
        });
      }),
      accent: "ninguno",
      lineas: 0,
      croquis: false,
    };
  });

  // SOLO trabajo por hacer. Los finalizados viven en la pestaña Historial, que
  // tiene su propio endpoint paginado y sin límite de antigüedad.
  //
  // Antes se mezclaban aquí los cerrados recientemente, y eso traía dos
  // problemas encadenados: el tablero cargaba 1290 pedidos y casi 1 MB para
  // enseñar 85, y cualquier corte por antigüedad dejaba un limbo — un pedido
  // cerrado antes del corte no salía en pendientes (RPS ya no lo da) ni en el
  // tablero, y parecía desaparecido (AR.26.02187). Sin mezcla no hay corte que
  // elegir y el limbo no existe.
  //
  // `pedidosHistorial` se sigue calculando y de momento no lo usa nadie: hay
  // que quitarlo, junto con la consulta que lo alimenta.
  return { operarios: OPERARIOS, pedidos };
}

// ─── Caché stale-while-revalidate + precalentamiento ─────────────────────────
// La vista tarda 7-15 s: nadie debe comérselos en una petición. Estrategia:
//  · Si hay caché (aunque esté caducada) se sirve AL INSTANTE; si caducó, se
//    lanza el refresco en segundo plano para la siguiente petición.
//  · Solo la primera carga en frío espera a la consulta — y el precalentado
//    de instrumentation.ts hace que eso ocurra al arrancar PM2, no al primer
//    usuario.

let cache: { data: Tablero; at: number } | null = null;
let enVuelo: Promise<Tablero> | null = null;

function refrescarTablero(): Promise<Tablero> {
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
  return enVuelo;
}

export async function getTableroRPS(): Promise<Tablero> {
  if (cache) {
    if (Date.now() - cache.at >= TTL_MS) {
      // Caducada: dato viejo ya, refresco detrás. Si el refresco falla se
      // sigue sirviendo lo último bueno (mejor dato viejo que error).
      refrescarTablero().catch(() => {});
    }
    return cache.data;
  }
  return refrescarTablero();
}

/** Frecuencia del refresco de fondo cuando nadie usa la app: mantiene la
 *  caché caliente sin machacar a RPS (con uso activo el SWR ya refresca
 *  cada TTL_MS). */
const REFRESCO_FONDO_MS = 5 * 60_000;

declare global {
  // Sobrevive a recargas de módulo (HMR en dev) para no apilar timers.
  var __coordinaPrecalentado: ReturnType<typeof setInterval> | undefined;
}

/** Llamado desde instrumentation.ts al arrancar el servidor: primera consulta
 *  ya (fire-and-forget) + refresco periódico de fondo. Idempotente. */
export function precalentarTablero(): void {
  if (globalThis.__coordinaPrecalentado) return;
  refrescarTablero().catch((e) => {
    console.warn("[coordina] precalentado del tablero falló (se reintenta):", e?.message);
  });
  globalThis.__coordinaPrecalentado = setInterval(() => {
    refrescarTablero().catch(() => {});
  }, REFRESCO_FONDO_MS);
  // No mantener vivo el proceso solo por el timer.
  globalThis.__coordinaPrecalentado.unref?.();
}
