import {
  SECCIONES,
  SECCION_POR_DEFECTO,
  recursosSql,
  type Seccion,
  type SeccionId,
} from "../secciones";
import { operariosDeSeccion } from "./operarios";
import type { Tablero } from "../data";
import type {
  CompraOF, Familia, ImputacionRps, MaterialAsignado, OF, Pedido, Prioridad,
} from "../types";
import { esCodigoPedido, hoyISO } from "../types";
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
  /** Lo que la OF necesita (CPRMOMaterial.Quantity). */
  cantidad: number | null;
  /** Lo apartado del almacén para ella (suma de STKStockReserve). 0 = asignado
   *  pero sin reservar. */
  reservada: number | null;
}

interface FilaCompra {
  orden: string | null;
  articulo: string | null;
  pedida: number | null;
  recibida: number | null;
  fechaPedido: Date | null;
  estimada: Date | null;
  proveedor: string | null;
}

interface FilaImputacion {
  orden: string | null;
  tarea: string | null;
  empleado: string | null;
  /** Nombre del empleado en RPS. Es el único que hay para quien no está en el
   *  mapa de operarios de OT (ver operarioDeEmpleado). */
  nombre?: string | null;
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

// AQUÍ HABÍA una `FilaHistorial` y todo el aparato que la llenaba: dos
// consultas a RPS, el agrupado por pedido y un `pedidosHistorial` que no leía
// nadie. El historial dejó de salir del tablero hace tiempo —vive en su propia
// pestaña, que lo pagina aparte— y esto se quedó calculándose en cada carga,
// dentro de la ruta que ya tarda de 7 a 15 s. Quitado el 2026-08-14, con el
// tablero contrastado antes y después contra RPS: mismos 81 pedidos, mismas
// 134 OF, mismos avisos e imputaciones.

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

/** Subfamilias que NO dicen de qué es el trabajo, solo qué se hace con él.
 *
 *  Cuelgan de familias muy distintas —LONASNUEVAS vive bajo REMOLQUE, CAMION,
 *  CARPAS, SUMINISTRO y AGRIGANA; CONFECCION bajo ESPECTACULO, SUMINISTRO,
 *  ACABADOS, TRABAJOSCLIENTE y más—, así que agrupar solo por ellas juntaba en
 *  un montón cosas que no se parecen en nada. Estas llevan la familia delante
 *  ("Camión · Lonas nuevas") y las demás van solas: "Toldo · Toldo nuevo" o
 *  "Suministro · Puertas" sería repetirse.
 *
 *  Para decidir si una entra aquí: mírese si aparece bajo más de una familia en
 *  el trabajo de OT. Las de la lista lo hacen; PUERTAS, TOLDO NUEVO, ACCESORIOS
 *  TF, YURTAS, CLONA, PISCINA y compañía cuelgan de una sola. */
const SUBFAMILIAS_GENERICAS = new Set([
  "LONASNUEVAS",
  "CONFECCION",
  "REPARACIONES",
  "LONAS",
]);

// ─── El vocabulario de la casa manda sobre el catálogo de RPS ────────────────
// Las reglas de abajo se miran ANTES que la subfamilia, y eso es un cambio de
// criterio pedido por Iván tras ver el resultado: la descripción de la OF dice
// de qué es el trabajo mucho mejor que la clasificación de RPS, que reparte lo
// mismo entre "SUMINISTRO", "CONFECCION" y "LONASNUEVAS" sin criterio útil.
//
// El ORDEN de las reglas es lo que las hace funcionar, porque casi todo empieza
// por "LONA…". De lo más específico a lo más general:
//
//   1. Transporte  "LATERAL CORREDERA TAUTLINER XL"      → Camión
//   2. Puertas     "LONA PARA PUERTA PLEGABLE"           → Puerta
//   3. Fundas      "FUNDA PARA TOLDO NUEVA"              → Funda
//   4. Lo que EMPIEZA por lona                           → Lona
//   5. Toldos y sus modelos, cerramientos, carpas…
//
// Si se cambia el orden, "LONA PARA PUERTA PLEGABLE" acaba en Lonas y "LATERAL
// CORREDERA TAUTLINER" en cualquier sitio.

/** Y por descripción, con el vocabulario del taller (acordado con Iván): los
 *  toldos incluyen cortinas, bambalinas y cambios de tela; los remolques,
 *  arquillados, baquetones y tautliners; las lonas, las de estructura, riel y
 *  ollaos. Lo específico va primero: "lona de tautliner" es un remolque. */
const FAMILIA_POR_TEXTO: [RegExp, Familia][] = [
  // ── 1. CAMIÓN ────────────────────────────────────────────────────────────
  // Lo primero, porque casi todo esto se describe empezando por "LONA…"
  // ("LONA SEPARA MERCANCIAS MONARD") y si no acabaría en lonas.
  [/TAUT?LINER|CAMI[OÓ]N|CISTERNA|COMPOCAR|SEPARA MERCANC/, "CAMION"],
  // ── 2. REMOLQUE ──────────────────────────────────────────────────────────
  // Las tildes se contemplan a mano: toUpperCase() no las quita y en RPS
  // conviven "BAQUETON" y "BAQUETÓN". "Capota" es de remolque salvo cuando es
  // de terraza, que entonces es una estructura de la casa
  // ("ESTRUCTURA CAPOTA CON PIES PARA TERRAZA").
  [/ARQUILLAD|BAQUET[OÓ]N|REMOLQUE|BOTELLERO|GANADO|CABALLO/, "REMOLQUE"],
  [/CAPOTA(?!.*TERRAZA)/, "REMOLQUE"],
  // ── 3. CERRAMIENTOS ──────────────────────────────────────────────────────
  // Antes que PUERTA: "CERRAMIENTO TEXTIL CON LONA:ENROLLABLE CON MOTOR" lleva
  // "enrollable" y no es una puerta, es un cerramiento de lona.
  [/CERRAMIENTO TEXTIL CON LONA/, "LONA"],
  // ── 4. PUERTA ────────────────────────────────────────────────────────────
  // Antes que las lonas por "LONA PARA PUERTA PLEGABLE", que es una puerta.
  [
    /PUERTA|APILABLE|ENROLLABLE|PLEGABLE|AUTOREPARABLE|AUTORREPARABLE|SECCIONAL|MUELLE DE CARGA/,
    "PUERTA",
  ],
  // ── 5. FUNDA ─────────────────────────────────────────────────────────────
  // "FUNDA PARA TOLDO NUEVA" es una funda, no un toldo: va antes que TOLDO.
  [/FUNDA|CUBRE\s?(?:COCHE|MOTO|BARCO)/, "FUNDA"],
  // ── 6. CARPA ─────────────────────────────────────────────────────────────
  // Antes que las lonas: "LONA PARA TECHO DE CARPA" es de una carpa, y la
  // carpa es la familia que se reconoce.
  [/CARPA|YURTA/, "CARPA"],
  // ── 7. LONA ──────────────────────────────────────────────────────────────
  // Lo que EMPIEZA por lona es una lona, dicho por Iván: con riel, de techo
  // para estructura, de piscina, confeccionada, con ollaos, cortada… Lo que
  // lleva "lona" en medio (un toldo, una capota) ya se decidió arriba.
  [/^\s*LONAS?\b/, "LONA"],
  [/LONA CON OLLAO|SACO CONFECCIONADO EN LONA/, "LONA"],
  // "Cortina" sirve para las dos cosas y lo que decide es con qué va (Iván):
  // un toldo cortina y un cambio de tela de cortina son TOLDO, pero una
  // cortina de lona con riel es LONA. Mira los dos órdenes, porque en RPS
  // aparece igual "LONA CORTINA…" que "CORTINA LONA…".
  [/CORTINA(?!.*(?:TOLDO|CAMBIO DE TELA)).*(?:LONA|RIEL)|(?:LONA|RIEL).*CORTINA/, "LONA"],
  // ── 8. TOLDO ─────────────────────────────────────────────────────────────
  // Con los modelos que se venden por su nombre: en el parte pone "Perlabox",
  // no "toldo cofre". Añadir modelos nuevos aquí.
  [
    /TOLDO|CORTINA|BAMBALINA|FALD[OÓ]N|CAMBIO DE TELA|CAMBIAR TELA|MARQUESINA|PROTECCI[OÓ]N SOLAR|BRAZOS INVISIBLES/,
    "TOLDO",
  ],
  [
    /ARZ[UÚ]A|XACOBEO|PERLA\s?BOX|[AÁ]MBAR\s?BOX|SPLEN\s?BOX|STOR|SCREEN|ELIT|IRIS\s?\d|COFRE/,
    "TOLDO",
  ],
  // ── 7. El resto, sin cambios ─────────────────────────────────────────────
  [/ORQUESTA|ESPECTACULO|ESCENARIO|TEL[OÓ]N/, "ESPECTACULO"],
  [/CARPA|YURTA/, "CARPA"],
  [/TAPIZ/, "TAPIZADO"],
  [/REPARAC/, "REPARACION"],
  [/SUMINISTRO|SYSTEM DOCK/, "SUMINISTRO"],
  // Red de seguridad: lleva "lona" en algún sitio y no ha encajado en nada.
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

  // La DESCRIPCIÓN manda sobre la subfamilia de RPS. Es lo que dice de qué es
  // el trabajo: el catálogo reparte lo mismo entre "SUMINISTRO", "CONFECCION" y
  // "LONASNUEVAS" sin criterio que sirva para agrupar, y la descripción sí
  // distingue una lona de piscina de un lateral de tautliner.
  for (const [re, familia] of FAMILIA_POR_TEXTO) if (re.test(desc)) return familia;

  // La familia de siempre: hace falta igual, como respaldo cuando el artículo
  // no tiene subfamilia y como APELLIDO de las subfamilias genéricas.
  const base = familiaBase(grupo);
  if (!sub) return base;
  return SUBFAMILIAS_GENERICAS.has(sub) ? `${base}/${sub}` : sub;
}

function familiaBase(grupo: string): Familia {
  for (const [re, familia] of FAMILIA_POR_GRUPO) if (re.test(grupo)) return familia;
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

/** Lo mínimo de una fila para cruzarla con lo que dice OLANET. Se declara
 *  aparte de `FilaVista` —que lo cumple— para no tener que construir las 20
 *  columnas en cada test. */
export interface FilaCruzable {
  OF: string | null;
  CodTarea: string | null;
  SitOF: string | null;
  PermiteImputaciones?: boolean | number | null;
}

/** La misma fase escrita por los dos sistemas: "0230700/3".
 *
 *  RPS guarda el código de tarea tal y como viene de la ruta ("03", "5", "42")
 *  y OLANET lo suyo en `Fase`, con los ceros a la izquierda a veces sí y a
 *  veces no. Sin normalizarlos, "03" y "3" son dos fases distintas y la OF
 *  saldría dos veces en el tablero: una por cada fuente.
 *
 *  El recorte deja siempre un dígito (`(?=\d)`): la tarea "0" existe de verdad
 *  en RPS —es la de Materiales— y comérsela dejaría la clave sin fase. */
export function claveFase(of: string | null, fase: string | null): string {
  const o = (of ?? "").trim();
  const f = (fase ?? "").trim().replace(/^0+(?=\d)/, "");
  return `${o}/${f}`;
}

/** Lo que la vista de RPS tiene y OLANET todavía no.
 *
 *  Manda OLANET, que es quien sabe si una fase está por hacer. Pero recibe las
 *  fases con retraso —medido el 2026-09-02: mediana 0 días, 51 de 58 el mismo
 *  día, máximo 3—, y sin esto el trabajo lanzado esta mañana no aparecería
 *  hasta mañana.
 *
 *  Solo entra lo FICHABLE. Lo que no admite imputaciones no está en OLANET
 *  precisamente por eso, y traerlo de la vista devolvería al tablero las
 *  DETENIDAS y CREADAS: tarjetas con el reloj muerto, 10 de las 43 filas que
 *  Diseño Gráfico veía ese día. */
export function filasQueFaltan<T extends FilaCruzable>(
  vista: readonly T[],
  enOlanet: readonly { of: string; fase: string }[],
): T[] {
  const ya = new Set(enOlanet.map((f) => claveFase(f.of, f.fase)));
  return vista.filter((f) => !ya.has(claveFase(f.OF, f.CodTarea)) && permiteImputaciones(f));
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

function agrupaImputaciones(
  filas: FilaImputacion[],
  claveDe: (f: FilaImputacion) => string,
): Map<string, FilaImputacion[]> {
  const porClave = new Map<string, FilaImputacion[]>();
  for (const f of filas) {
    const clave = claveDe(f);
    const suyas = porClave.get(clave);
    if (suyas) suyas.push(f);
    else porClave.set(clave, [f]);
  }
  return porClave;
}

/** Quién ha imputado tiempo en esta OF y cuánto cada uno, de más a menos.
 *
 *  Es el registro de RPS tal cual, sin filtrar por Oficina Técnica: en la tarea
 *  de OT quien imputa es de OT, pero la consulta del historial agrupa por OF y
 *  ahí puede aparecer gente de taller — y si aparece, se enseña, porque el
 *  tiempo que se ve en el total es suyo. A quien no está en el mapa de
 *  operarios le queda su nombre de RPS, que es el único que hay.
 *
 *  La SQL ya agrupa por empleado, pero se vuelve a sumar aquí: así la función
 *  vale para cualquier lote de filas y no depende de que la query agrupe. */
export function desgloseImputaciones(filas: FilaImputacion[]): ImputacionRps[] {
  const porEmpleado = new Map<string, ImputacionRps>();
  for (const f of filas) {
    const empleado = String(f.empleado ?? "").trim();
    if (!empleado) continue;
    const desde = fechaISO(f.desde ?? null) ?? undefined;
    const ya = porEmpleado.get(empleado);
    if (ya) {
      ya.minutos += f.minutos ?? 0;
      if (desde && (!ya.desde || desde < ya.desde)) ya.desde = desde;
      continue;
    }
    porEmpleado.set(empleado, {
      empleado,
      nombre: (f.nombre ?? "").trim() || `Empleado ${empleado}`,
      operarioId: operarioDeEmpleado(empleado),
      minutos: f.minutos ?? 0,
      ...(desde ? { desde } : {}),
    });
  }
  return [...porEmpleado.values()].sort((a, b) => b.minutos - a.minutos);
}

/** El autor que se deduce de RPS: el operario de OT con más minutos imputados.
 *
 *  Se saca del mismo desglose que se enseña, y no de un recorrido aparte, para
 *  que el panel no pueda decir "Autor: Alberto" mientras el desglose de al lado
 *  da más minutos a otro. Gente de fuera de OT no puede ser autor: en el tablero
 *  no existe a quién asignarle la OF. */
export function autorDeImputaciones(desglose: ImputacionRps[]): string | null {
  return desglose.find((i) => i.operarioId !== null)?.operarioId ?? null;
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
export function permiteImputaciones(fila: FilaCruzable): boolean {
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
  /** Todo el material de la OF, con lo reservado de cada línea. */
  materiales: MaterialAsignado[];
  /** Quién ha imputado tiempo en la tarea de OT y cuánto cada uno, según RPS.
   *  De aquí salen los minutos de planteo (la suma) y el autor deducido. */
  imputaciones: ImputacionRps[];
  /** Tareas-nota de la ruta ("22/06 VISITA MEDIR"). */
  avisos: string[];
  /** Arranque planificado de la primera fase de producción tras el planteo. */
  fechaLimitePlanteo: string | undefined;
  /** Día de la primera imputación de tiempo en RPS (undefined = ninguna). */
  fichadaDesde: string | undefined;
  /** Subfamilia del artículo en RPS (CodProductSubFamily). Afina la familia
   *  donde el catálogo de RPS la deja corta; ver FAMILIA_POR_SUBFAMILIA. */
  subfamilia: string | undefined;
  /** Lo que Compras ha pedido para la OF. */
  compras: CompraOF[];
}

/** Los tres campos de material de la OF, del mismo sitio para que no se
 *  contradigan: todo lo asignado, y de eso lo que está reservado. */
function materialYReservas(
  materiales: MaterialAsignado[],
): Pick<OF, "materiales" | "reservasMaterial" | "reservasDetalle"> {
  const reservados = materiales.filter((m) => m.reservada > 0);
  return {
    materiales: materiales.length ? materiales : undefined,
    reservasMaterial: reservados.length,
    reservasDetalle: reservados.length
      ? reservados.map((m) => `${m.descripcion} · ${m.reservada}`)
      : undefined,
  };
}

/** Los minutos de planteo son la SUMA del desglose, nunca un dato aparte: así
 *  el total y el "quién echó cuánto" no pueden contarse cosas distintas. */
function minutosDe(desglose: ImputacionRps[]): number {
  return desglose.reduce((n, i) => n + i.minutos, 0);
}

function aOF(fila: FilaVista, datos: DatosOF): OF {
  const orden = (fila.OF ?? "").trim();
  const fichadoMin = minutosDe(datos.imputaciones);
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
    autorId: datos.fichandoOperario ?? autorDeImputaciones(datos.imputaciones),
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
    // Lo RESERVADO se sigue contando aparte de lo asignado: son dos cosas
    // distintas y la interfaz distingue una de otra.
    ...materialYReservas(datos.materiales),
    compras: datos.compras.length ? datos.compras : undefined,
    avisos: datos.avisos.length ? datos.avisos : undefined,
    fechaLimitePlanteo: datos.fechaLimitePlanteo,
    fichadaDesde: datos.fichadaDesde,
    tiempoEstimadoMin: fila.TiempoPrevisto ?? 0,
    tiempoPlanteoMin: fichadoMin,
    // El desglose de esos minutos. Sin él, una OF de antes de la web enseñaba
    // el tiempo pero no de quién era, y el autor deducido se llevaba de cara
    // también las horas que había echado otro.
    imputaciones: datos.imputaciones.length ? datos.imputaciones : undefined,
    tiempoRevisionMin: 0,
    observacion: (fila.NotasOF ?? "").trim() || undefined,
  };
}

// ─── Consulta + agrupado ─────────────────────────────────────────────────────

/** QUÉ tiene pendiente la vista de la sección, sin los datos del pedido.
 *
 *  Solo las claves y lo que hace falta para cruzarlas con OLANET. Los datos se
 *  piden después, acotados a esas OF, y eso es lo que abarata la consulta: la
 *  vista es cara por su cadena de LEFT JOIN a pedido de venta, cliente,
 *  artículo y familia, y sin pedir esas columnas el optimizador se los salta
 *  enteros.
 *
 *  Medido contra la BD real el 2026-09-02, tablero de Oficina Técnica:
 *
 *    vista completa, de una vez ......... 4.255 ms
 *    solo las claves .......................587 ms
 *    detalle de esas 60 OF por IN (…) ......492 ms
 *
 *  Las dos formas devuelven LO MISMO: mismas 67 filas y, comparadas campo a
 *  campo las 20 columnas, cero diferencias. */
async function clavesDeLaVista(
  pool: import("mssql").ConnectionPool,
  seccion: Seccion,
): Promise<FilaCruzable[]> {
  const r = await pool.request().query<FilaCruzable>(`
    SELECT [OF], CodTarea, SitOF, PermiteImputaciones FROM dbo.${seccion.vista}
  `);
  return r.recordset;
}

/** Las claves de unas filas, como las quiere `filasPorFase`. */
function paresDe(filas: readonly FilaCruzable[]): { of: string; fase: string }[] {
  return filas.map((f) => ({ of: (f.OF ?? "").trim(), fase: (f.CodTarea ?? "").trim() }));
}

/** Las mismas columnas que la vista, pero para unas fases concretas.
 *
 *  Es el cuerpo de `TGM_PENDIENTE_*` SIN sus dos filtros
 *  (`e.PercentProgress < 100` y `sit.CodSituation NOT IN (6)`), que son justo
 *  los que esconden el trabajo: el primero significa "alguien le fichó" y no
 *  "está hecha", y el segundo tira lo que se lleva por delante un cierre
 *  masivo de RPS (3.274 OFs el 28/07/2026, unas 12.000 entre el 27 y el 30/04).
 *
 *  Quién está pendiente lo decide OLANET; esto solo pone los datos del pedido.
 *  Por eso se copia el SELECT a nuestro código en vez de pedirle otra vista a
 *  IT: el filtrado ya no es cosa de la vista. */
async function filasPorFase(
  pool: import("mssql").ConnectionPool,
  seccion: Seccion,
  fases: readonly { of: string; fase: string }[],
): Promise<FilaVista[]> {
  const ordenes = [...new Set(fases.map((f) => f.of).filter((o) => /^[\w.-]+$/.test(o)))];
  if (ordenes.length === 0) return [];
  const enOrdenes = ordenes.map((o) => `'${o}'`).join(",");

  const r = await pool.request().query<FilaVista>(`
    SELECT d.CodManufacturingOrder AS [OF], e.CodMOTask AS CodTarea,
           e.Description AS Tarea, b.CodOrder AS Pedido, cli.Description AS Cliente,
           STR(a.Quantity, 3, 0) + ' - ' + fam.CodProductFamily AS Articulo,
           (CASE WHEN ISNULL(l.TextoRotulacion, 'nulo') = 'nulo' THEN NULL
                 ELSE l.TextoRotulacion END) AS Rotulacion,
           a.ReceptionDemandDate AS FechaSolicitada, d.Priority AS Prioridad,
           e.ExecutionTime AS TiempoPrevisto,
           (SELECT MAX(ReceptionDate) FROM dbo.PUROrderLine
             WHERE CodCompany = '001' AND IDManufacturingOrder = d.IDManufacturingOrder
               AND Quantity > ReceivedQuantity) AS FechaCompras,
           CONVERT(datetime,
             (SELECT TOP (1) SUBSTRING(Planning, 28, 19) FROM dbo.PACResourcePlanning
               WHERE CodCompany = '001' AND EntityCode = d.CodManufacturingOrder
                 AND Planning LIKE '%CodTask="' + e.CodMOTask + '"%'), 101) AS FechaPlanificada,
           sit.Description AS SitOF, sit.AllowImputations AS PermiteImputaciones,
           d.Notes AS NotasOF,
           d.Description AS DescripcionMO, d.Quantity AS Cantidad,
           d.PlannedStartDate, d.PlannedEndDate, d.ManualEndDate
      FROM dbo.CPRMOTask AS e
      INNER JOIN dbo.CPRManufacturingOrder AS d WITH (NOLOCK)
        ON e.IDManufacturingOrder = d.IDManufacturingOrder
      INNER JOIN dbo.CPRManufacturingOrderSituation AS sit WITH (NOLOCK)
        ON d.IDMOSituation = sit.IDManufacturingOrderSituation
      INNER JOIN dbo.CPRMOResourceMachine AS f WITH (NOLOCK)
        ON e.IDMOTask = f.IDMOTask AND f.CodMOResourceMachine IN (${recursosSql(seccion)})
      LEFT OUTER JOIN dbo.FACOrderLineSL AS a WITH (NOLOCK)
        ON d.IDManufacturingOrder = a.IDManufacturingOrder
      LEFT OUTER JOIN dbo.FACOrderSL AS b WITH (NOLOCK) ON a.IDOrder = b.IDOrder
      LEFT OUTER JOIN dbo.FACCustomer AS cli WITH (NOLOCK) ON b.IDCustomer = cli.IDCustomer
      LEFT OUTER JOIN dbo.STKArticle AS art WITH (NOLOCK) ON a.IDArticle = art.IDArticle
      LEFT OUTER JOIN dbo.GENProductFamily AS fam WITH (NOLOCK)
        ON art.IDProductFamily = fam.IDProductFamily
      LEFT OUTER JOIN dbo._FACOrderLineSL_Custom AS l WITH (NOLOCK)
        ON a.IDOrderLine = l.IDOrderLine
     WHERE f.CodCompany = '001' AND d.CodManufacturingOrder IN (${enOrdenes})
  `);

  // La consulta trae TODAS las fases de la sección de esas OFs —una OF puede
  // tener dos— y aquí nos quedamos solo con las que OLANET dio por pendientes.
  const quiero = new Set(fases.map((f) => claveFase(f.of, f.fase)));
  return r.recordset.filter((f) => quiero.has(claveFase(f.OF, f.CodTarea)));
}

/** De dónde sale la lista de trabajo de esta sección. Ver `Seccion.fuente`.
 *
 *  Las dos fuentes dicen QUÉ (OF, tarea) está pendiente; los datos del pedido
 *  los pone siempre `filasPorFase`, una sola vez y para las dos. Antes había
 *  dos consultas con el mismo SELECT de 20 columnas y había que mantenerlas a
 *  mano en sintonía. */
async function filasDeLaSeccion(
  pool: import("mssql").ConnectionPool,
  seccion: Seccion,
): Promise<FilaVista[]> {
  if (seccion.fuente === "vista") {
    const claves = await clavesDeLaVista(pool, seccion);
    return filasPorFase(pool, seccion, paresDe(claves));
  }

  // OLANET manda, y la vista solo completa lo recién lanzado que OLANET aún no
  // tenga. Las dos consultas van en paralelo: son servidores distintos.
  const { fasesPendientesDe } = await import("./olanet");
  const [fases, claves] = await Promise.all([
    fasesPendientesDe(seccion),
    clavesDeLaVista(pool, seccion),
  ]);
  return filasPorFase(pool, seccion, [...fases, ...paresDe(filasQueFaltan(claves, fases))]);
}

async function consultarTablero(seccion: Seccion): Promise<Tablero> {
  const { getPool } = await import("./db");
  const pool = await getPool();

  // La lista de OFs pendientes es LA consulta cara; el resto de datos
  // auxiliares se piden después, en paralelo, contra tablas indexadas.
  const vista = { recordset: await filasDeLaSeccion(pool, seccion) };

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
        .filter(esCodigoPedido),
    ),
  ];
  const listaPedidosIn = codigosPedido.length
    ? codigosPedido.map((c) => `'${c}'`).join(",")
    : "''";

  const [fichajes, reservas, compras, imputaciones, ventas, tareas, subfamilias] =
    await Promise.all([
    pool.request().query<FilaFichaje>(`
      SELECT orden, fase, tiempo, codoperario FROM dbo.tgm_fichajes_olanet
    `),
    // El material de cada OF: lo que LLEVA y, de eso, lo que está reservado.
    //
    // Antes se preguntaba solo por las reservas (partiendo de STKStockReserve),
    // y una OF con material asignado pero sin reservar parecía no llevar nada.
    // Pasó con AR.26.03981: 20 m de lona en la OF y cero reservas, y el detalle
    // del pedido salía vacío. Son dos cosas distintas —lo asignado viene del
    // escandallo, la reserva es haberlo apartado— y hacen falta las dos.
    //
    // Ahora se parte del MATERIAL y la reserva se suma por fuera. Acotado a las
    // OF que ya se están pidiendo: sin ese filtro son 3320 materiales y 500 ms,
    // con él es un puñado.
    pool.request().query<FilaReserva>(`
      SELECT mo.CodManufacturingOrder AS orden, m.Description AS material,
             m.Quantity AS cantidad, ISNULL(res.reservada, 0) AS reservada
      FROM dbo.CPRMOMaterial m
      JOIN dbo.CPRMOTask t ON t.IDMOTask = m.IDMOTask
      JOIN dbo.CPRManufacturingOrder mo
        ON mo.IDManufacturingOrder = t.IDManufacturingOrder AND mo.CodCompany = '001'
      OUTER APPLY (
        SELECT SUM(r.Quantity) AS reservada
        FROM dbo.STKStockReserve r
        WHERE r.ItemType = 5 AND r.IDItem = m.IDMOMaterial
      ) res
      WHERE mo.CodManufacturingOrder IN (${listaIn})
    `),
    // Lo que COMPRAS ha pedido para cada OF: el tercer paso del recorrido del
    // material (ver el comentario de CompraOF en types.ts). Va en su propia
    // consulta y en su propia lista porque en RPS no encadena con lo asignado:
    // de las 44 compras de las OF del tablero (11/08/2026) solo UNA
    // corresponde a un material asignado, y `IDMOMaterial` viene vacío en las
    // 44. Lo que se pide para una OF suele ser otra cosa —tubo, herrajes— o
    // trabajo de fuera (lacado, vinilo, portes).
    pool.request().query<FilaCompra>(`
      SELECT mo.CodManufacturingOrder AS orden, art.Description AS articulo,
             l.Quantity AS pedida, l.ReceivedQuantity AS recibida,
             o.OrderDate AS fechaPedido, l.ReceptionDate AS estimada,
             prov.Description AS proveedor
      FROM dbo.PUROrderLine l
      JOIN dbo.PUROrder o ON o.IDOrder = l.IDOrder
      JOIN dbo.CPRManufacturingOrder mo
        ON mo.IDManufacturingOrder = l.IDManufacturingOrder AND mo.CodCompany = '001'
      LEFT JOIN dbo.STKArticle art ON art.IDArticle = l.IDArticle
      LEFT JOIN dbo.PURSupplier prov ON prov.IDSupplier = o.IDSupplier
      WHERE l.CodCompany = '001'
        AND mo.CodManufacturingOrder IN (${listaIn})
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
             e.CodEmployee AS empleado, e.Description AS nombre,
             SUM(i.ExecutionTime) AS minutos,
             MIN(CASE WHEN i.ImputationDate <= GETDATE() THEN i.ImputationDate END) AS desde
      FROM dbo.CPRImputationMO i
      JOIN dbo.CPRManufacturingOrder mo
        ON mo.IDManufacturingOrder = i.IDManufacturingOrder AND mo.CodCompany = '001'
      JOIN dbo.CPRMOTask t ON t.IDMOTask = i.IDMOTask
      JOIN dbo.GENEmployee e ON e.IDEmployee = i.IDEmployeeMachineTool
      WHERE mo.CodManufacturingOrder IN (${listaIn})
      GROUP BY mo.CodManufacturingOrder, t.CodMOTask, e.CodEmployee, e.Description
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
      WHERE mo.CodManufacturingOrder IN (${listaIn})
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
        AND mo.CodManufacturingOrder IN (${listaIn})
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

  // Material por OF: todo lo que lleva, con lo reservado de cada línea.
  const materialesPorOF = new Map<string, MaterialAsignado[]>();
  for (const r of reservas.recordset) {
    const orden = (r.orden ?? "").trim();
    if (!orden) continue;
    const lista = materialesPorOF.get(orden) ?? [];
    lista.push({
      descripcion: (r.material ?? "").trim().replace(/\s+/g, " ") || "(material sin nombre)",
      cantidad: r.cantidad ?? 0,
      reservada: r.reservada ?? 0,
    });
    materialesPorOF.set(orden, lista);
  }

  // Compras por OF: lo más reciente primero, que es lo que se mira.
  const comprasPorOF = new Map<string, CompraOF[]>();
  for (const c of compras.recordset) {
    const orden = (c.orden ?? "").trim();
    if (!orden) continue;
    const lista = comprasPorOF.get(orden) ?? [];
    lista.push({
      articulo: (c.articulo ?? "").trim().replace(/\s+/g, " ") || "(artículo sin nombre)",
      pedida: c.pedida ?? 0,
      recibida: c.recibida ?? 0,
      fechaPedido: fechaISO(c.fechaPedido) ?? undefined,
      estimada: fechaISO(c.estimada) ?? undefined,
      proveedor: (c.proveedor ?? "").trim() || undefined,
    });
    comprasPorOF.set(orden, lista);
  }
  for (const lista of comprasPorOF.values()) {
    lista.sort((a, b) => (b.fechaPedido ?? "").localeCompare(a.fechaPedido ?? ""));
  }

  // Fichajes con intervalo abierto ahora mismo, por OF+tarea → operario del
  // tablero (null si ficha alguien de fuera de OT).
  const abiertos = new Map<string, string | null>(
    fichajes.recordset.map((f) => [
      `${(f.orden ?? "").trim()}:${(f.fase ?? "").trim()}`,
      operarioDeEmpleado(f.codoperario),
    ]),
  );

  // Imputaciones de RPS por OF+tarea, agrupadas por persona. De aquí salen las
  // tres cosas que antes se calculaban en tres sitios y podían no cuadrar: el
  // desglose que se enseña, el total de minutos (su suma) y el autor deducido
  // (el de OT con más). Las fechas se juntan y se decide con `primeraImputacion`
  // (la buena es la MÁS temprana, no la de la primera fila que llegue).
  const filasPorTarea = agrupaImputaciones(
    imputaciones.recordset,
    (r) => `${(r.orden ?? "").trim()}:${(r.tarea ?? "").trim()}`,
  );
  const desglosePorTarea = new Map<string, ImputacionRps[]>();
  const desdePorTarea = new Map<string, string>();
  for (const [clave, filas] of filasPorTarea) {
    desglosePorTarea.set(clave, desgloseImputaciones(filas));
    const desde = primeraImputacion(filas.map((f) => f.desde));
    if (desde) desdePorTarea.set(clave, desde);
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
    // De MENOR a MAYOR número de OF. La vista de RPS las devuelve en su
    // orden, que sale del revés: en la ficha del pedido salía arriba la OF más
    // alta, o sea la última, y se leía al contrario de como está el parte —
    // donde la línea 01 es la primera.
    //
    // Se ordena AQUÍ, al construir el pedido, y no en la ficha: así el mismo
    // orden vale para el detalle, la fila del tablero, los chips y el fichaje
    // por pedido. Ordenarlo solo en un sitio dejaría cada vista contando las
    // mismas OF en orden distinto.
    //
    // Numérico y no alfabético: los códigos vienen con ceros delante
    // ("0227526") y ahí las dos ordenaciones coinciden, pero uno sin rellenar
    // pondría "10" antes que "9". Con `localeCompare` de reserva para lo que
    // no sea un número.
    const filas = unaFilaPorOF(grupo.filas).sort((a, b) => {
      const ca = (a.OF ?? "").trim();
      const cb = (b.OF ?? "").trim();
      const na = Number(ca);
      const nb = Number(cb);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return ca.localeCompare(cb);
    });
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

    // El PDF escaneado existe para los pedidos de venta reales (AR/SA/BE);
    // el endpoint responde 404 si falta y la tarjeta enseña la réplica.
    const scanUrl = esCodigoPedido(grupo.codigo)
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
          materiales: materialesPorOF.get(orden) ?? [],
          compras: comprasPorOF.get(orden) ?? [],
          imputaciones: desglosePorTarea.get(clave) ?? [],
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
  // Quedaba el rastro de aquello: un `pedidosHistorial` que ya no leía nadie y
  // las dos consultas que lo alimentaban, calculándose en cada carga dentro de
  // la ruta que ya tarda de 7 a 15 s. Fuera desde el 2026-08-14.
  // Solo los de ESTA sección: las zonas del tablero son personas, y a Carrón
  // no le sirve de nada una columna de Jaime —ni al revés—. Si la sección no
  // tuviera a nadie apuntado se devuelven todos, que es lo que había antes:
  // más vale un tablero raro que uno vacío.
  const suyos = new Set(operariosDeSeccion(seccion.id));
  const operarios = OPERARIOS.filter((o) => suyos.has(o.id));
  return { operarios: operarios.length > 0 ? operarios : OPERARIOS, pedidos };
}

// ─── Caché stale-while-revalidate + precalentamiento ─────────────────────────
// La vista tarda 7-15 s: nadie debe comérselos en una petición. Estrategia:
//  · Si hay caché (aunque esté caducada) se sirve AL INSTANTE; si caducó, se
//    lanza el refresco en segundo plano para la siguiente petición.
//  · Solo la primera carga en frío espera a la consulta — y el precalentado
//    de instrumentation.ts hace que eso ocurra al arrancar PM2, no al primer
//    usuario.

// UNA CACHÉ POR SECCIÓN. Son dos consultas distintas contra dos vistas
// distintas, y con una sola entrada la última en refrescarse le serviría su
// tablero a la otra sección: Carrón vería el trabajo de OT o al revés, según
// quién hubiera entrado antes. El bug sería intermitente y dificilísimo de
// leer, así que la clave es la sección.
const cache = new Map<SeccionId, { data: Tablero; at: number }>();
const enVuelo = new Map<SeccionId, Promise<Tablero>>();

function refrescarTablero(seccion: Seccion): Promise<Tablero> {
  const yendo = enVuelo.get(seccion.id);
  if (yendo) return yendo;
  const p = consultarTablero(seccion)
    .then((data) => {
      cache.set(seccion.id, { data, at: Date.now() });
      return data;
    })
    .finally(() => {
      enVuelo.delete(seccion.id);
    });
  enVuelo.set(seccion.id, p);
  return p;
}

/** Un tablero vacío, sin operarios ni pedidos. Lo que se sirve de una sección
 *  en obras: ni una consulta a RPS, ni una fila que nadie deba creerse. */
const TABLERO_VACIO: Tablero = { operarios: [], pedidos: [] };

export async function getTableroRPS(seccionId: SeccionId = SECCION_POR_DEFECTO): Promise<Tablero> {
  const seccion = SECCIONES[seccionId];
  // En obras: no se consulta nada. Ver `Seccion.enObras`.
  if (seccion.enObras) return TABLERO_VACIO;
  const guardado = cache.get(seccion.id);
  if (guardado) {
    if (Date.now() - guardado.at >= TTL_MS) {
      // Caducada: dato viejo ya, refresco detrás. Si el refresco falla se
      // sigue sirviendo lo último bueno (mejor dato viejo que error).
      refrescarTablero(seccion).catch(() => {});
    }
    return guardado.data;
  }
  return refrescarTablero(seccion);
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
  // Las secciones EN USO: si solo se calentara OT, el primero de diseño en
  // entrar por la mañana se comería los 7-15 s de su vista, que es justo lo que
  // este precalentado existe para evitar. Las que están en obras no se calientan
  // porque no se consultan (ver `Seccion.enObras`).
  const todas = Object.values(SECCIONES).filter((s) => !s.enObras);
  for (const s of todas) {
    refrescarTablero(s).catch((e) => {
      console.warn(`[coordina] precalentado de ${s.nombre} falló (se reintenta):`, e?.message);
    });
  }
  globalThis.__coordinaPrecalentado = setInterval(() => {
    for (const s of todas) refrescarTablero(s).catch(() => {});
  }, REFRESCO_FONDO_MS);
  // No mantener vivo el proceso solo por el timer.
  globalThis.__coordinaPrecalentado.unref?.();
}
