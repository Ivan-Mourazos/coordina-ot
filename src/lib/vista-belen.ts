// ─── Vista de Belén Alamancos: contrato y lógica pura ────────────────────
// Client-safe: ni mssql ni RPS. De dónde sale cada dato está en
// server/vista-belen-db.ts; aquí solo QUÉ significa.
//
// Belén (09/11/2026) lo pidió así: buscar un pedido y ver una fila por OF con
// la prioridad, un punto de color por los bultos, la situación, cada operación
// FINALIZADA o INTERRUMPIDA, forma de entrega, rotulación, quién hizo el
// paquete, fecha comprometida, fecha de compras, el comentario de la OF, el
// material pendiente y si hay TP/COT. El buscador encuentra cualquier pedido;
// las pestañas, solo los AR (Belén: «de SA y BE no los reviso»).

/** Verde: subidas tantas unidades como lleva la OF (trabajo acabado).
 *  Granate: hay unidades subidas, pero no cuadran con la OF.
 *  Rojo: no se ha subido nada (trabajo sin acabar). */
export type PuntoBultos = "verde" | "granate" | "rojo";

export type EstadoOperacion = "finalizado" | "interrumpido" | "sin_empezar";

export interface OperacionOF {
  codigo: string;
  descripcion: string;
  maquina: string | null;
  estado: EstadoOperacion;
}

/** TP = trabajo previo a pedido; COT = consulta con Oficina Técnica. Son avisos
 *  de RPS colgados de una tarea de visita de la OF. */
export type TipoAviso = "TP" | "COT";

export interface AvisoOF {
  tipo: TipoAviso;
  codigo: string;
  descripcion: string;
  /** ISO yyyy-mm-dd. null = sin cerrar, pendiente de hacer. */
  cerrado: string | null;
}

export interface PaqueteOF {
  quien: string | null;
  /** ISO con hora. */
  fecha: string | null;
  unidades: number;
}

export interface CompraPendiente {
  articulo: string;
  pedida: number;
  recibida: number;
  /** ISO yyyy-mm-dd. */
  prevista: string | null;
  proveedor: string | null;
}

export interface OFBelen {
  of: string;
  pedido: string;
  linea: number | null;
  cliente: string | null;
  prioridad: number | null;
  descripcion: string;
  situacion: string;
  cantidad: number;
  subidas: number;
  /** ISO yyyy-mm-dd. La que pidió el cliente («F.Sol»). */
  fechaSolicitada: string | null;
  /** ISO yyyy-mm-dd. La que dio Producción («F.Compro»). */
  fechaComprometida: string | null;
  /** ISO yyyy-mm-dd. Cuándo llega lo último que falta de compras. */
  fechaCompras: string | null;
  formaEntrega: string | null;
  rotulacion: string | null;
  notas: string | null;
  operaciones: OperacionOF[];
  avisos: AvisoOF[];
  paquetes: PaqueteOF[];
  compras: CompraPendiente[];
  /** La instalación programada: «Prev Logística» en su pantalla de antes. */
  logistica: { fecha: string | null; responsable: string | null } | null;
}

export interface PedidoBelen {
  codigo: string;
  cliente: string | null;
  ofs: OFBelen[];
}

export function puntoBultos(cantidad: number, subidas: number): PuntoBultos {
  if (!subidas) return "rojo";
  return subidas === cantidad ? "verde" : "granate";
}

/** Una operación está acabada si OLANET la dio por finalizada (3) o RPS la
 *  tiene al 100 %. Empezada y sin acabar —OLANET la cargó en máquina (1) o la
 *  interrumpió (2), RPS lleva algo de avance o alguien imputó tiempo— es
 *  INTERRUMPIDA, que es como lo dice Belén. */
export function estadoOperacion(o: {
  olanet: number | null;
  porcentaje: number | null;
  imputaciones: number;
}): EstadoOperacion {
  if (o.olanet === 3 || (o.porcentaje ?? 0) >= 100) return "finalizado";
  if (o.olanet === 1 || o.olanet === 2 || (o.porcentaje ?? 0) > 0 || o.imputaciones > 0) return "interrumpido";
  return "sin_empezar";
}

/** La fecha comprometida va en RPS como TEXTO en una característica de la OF, y
 *  a la AMERICANA: «mm/dd/aaaa». Medido el 09/11/2026: en 473 de 855 el segundo
 *  número pasa de 12 y el primero nunca («11/13/2026»). Es la misma fecha que
 *  el formulario «Opción pedido» (58 de 59 pedidos coinciden). Devuelve ISO o
 *  null si no se entiende o no existe. */
export function fechaDeTexto(texto: string | null | undefined): string | null {
  const m = (texto ?? "").trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return null;
  const [, mes, d, a] = m;
  const anio = a.length === 2 ? `20${a}` : a;
  const dd = Number(d);
  const mm = Number(mes);
  // El 31/02 o el 29/02 de un año no bisiesto no existen: Date los corre al
  // mes siguiente, y así se notan.
  const f = new Date(Date.UTC(Number(anio), mm - 1, dd));
  if (f.getUTCMonth() !== mm - 1 || f.getUTCDate() !== dd) return null;
  return `${anio}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** Resumen de los TP o COT de una OF para la etiqueta: pendiente si alguno
 *  sigue abierto; si no, la fecha del último cierre. null si no hay ninguno. */
export function resumenAvisos(
  avisos: readonly AvisoOF[],
  tipo: TipoAviso,
): { pendiente: boolean; fecha: string | null; avisos: AvisoOF[] } | null {
  const suyos = avisos.filter((a) => a.tipo === tipo);
  if (!suyos.length) return null;
  const pendiente = suyos.some((a) => !a.cerrado);
  const fecha = suyos.map((a) => a.cerrado).filter((f): f is string => !!f).sort().pop() ?? null;
  return { pendiente, fecha, avisos: suyos };
}

/** Una tarea puede tener VARIAS máquinas en RPS (es justo uno de los fallos que
 *  vigila Belén) y el join devuelve una fila por máquina. Deja una por tarea,
 *  con sus máquinas juntas («A-CFAC, A-CONF»). Respeta el orden de llegada. */
export function unaFilaPorTarea<T extends { idTarea: string; maq: string | null }>(filas: readonly T[]): T[] {
  const porTarea = new Map<string, T>();
  for (const f of filas) {
    const ya = porTarea.get(f.idTarea);
    if (!ya) {
      porTarea.set(f.idTarea, { ...f });
      continue;
    }
    const maquinas = new Set([ya.maq, f.maq].flatMap((m) => (m ?? "").split(", ")).filter(Boolean));
    ya.maq = maquinas.size ? [...maquinas].join(", ") : null;
  }
  return [...porTarea.values()];
}

/** Las OF finalizadas van al final y plegadas: lo que mira Belén es lo que
 *  aún se mueve. Dentro de cada grupo, por número de OF. */
export function ordenarOFs(ofs: readonly OFBelen[]): { abiertas: OFBelen[]; finalizadas: OFBelen[] } {
  const porOF = (a: OFBelen, b: OFBelen) => a.of.localeCompare(b.of);
  const fin = (o: OFBelen) => o.situacion.trim().toUpperCase() === "FINALIZADA";
  return {
    abiertas: ofs.filter((o) => !fin(o)).sort(porOF),
    finalizadas: ofs.filter(fin).sort(porOF),
  };
}

/** «dd/mm/aa» para una fecha ISO, sin pasar por la zona horaria del navegador:
 *  RPS guarda las fechas a medianoche y un `new Date` en UTC las retrasaría un
 *  día en según qué equipo. */
export function fechaCorta(iso: string | null | undefined): string {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : "";
}

/** Lo que se cuenta una sola vez en la cabecera del pedido.
 *
 *  · `comunes`: entrega, rotulación y fecha solicitada si son IGUALES en todas
 *    las OF abiertas (lo normal). Si alguna difiere, va null. Cada OF enseña
 *    la suya solo cuando no coincide con la común (ver `difiereDelPedido`).
 *  · contadores para la línea de resumen («1 sin bultos · TP pendiente…»). */
export interface ResumenPedido {
  comunes: { formaEntrega: string | null; rotulacion: string | null; fechaSolicitada: string | null };
  /** true si ese dato es el mismo en todas las OF (aunque sea null). */
  igual: { formaEntrega: boolean; rotulacion: boolean; fechaSolicitada: boolean };
  ofs: number;
  bultos: Record<PuntoBultos, number>;
  tpPendiente: number;
  cotPendiente: number;
  conMaterialPendiente: number;
  /** La más temprana de las OF sin finalizar. */
  comprometida: string | null;
}

export function resumenPedido(pedido: PedidoBelen): ResumenPedido {
  const ofs = pedido.ofs;
  const abiertas = ofs.filter((o) => o.situacion.trim().toUpperCase() !== "FINALIZADA");
  // Lo común se mira en las OF que siguen abiertas, que son las que se leen:
  // una finalizada de hace un mes con otra rotulación no debe convertir la
  // cabecera en «distinta por OF». Si están todas finalizadas, todas.
  const base = abiertas.length ? abiertas : ofs;
  const todasIgual = <K extends "formaEntrega" | "rotulacion" | "fechaSolicitada">(k: K) =>
    base.every((o) => (o[k] ?? null) === (base[0]?.[k] ?? null));
  const igual = {
    formaEntrega: todasIgual("formaEntrega"),
    rotulacion: todasIgual("rotulacion"),
    fechaSolicitada: todasIgual("fechaSolicitada"),
  };
  const bultos: Record<PuntoBultos, number> = { verde: 0, granate: 0, rojo: 0 };
  for (const o of ofs) bultos[puntoBultos(o.cantidad, o.subidas)]++;
  return {
    comunes: {
      formaEntrega: igual.formaEntrega ? (base[0]?.formaEntrega ?? null) : null,
      rotulacion: igual.rotulacion ? (base[0]?.rotulacion ?? null) : null,
      fechaSolicitada: igual.fechaSolicitada ? (base[0]?.fechaSolicitada ?? null) : null,
    },
    igual,
    ofs: ofs.length,
    bultos,
    tpPendiente: ofs.filter((o) => resumenAvisos(o.avisos, "TP")?.pendiente).length,
    cotPendiente: ofs.filter((o) => resumenAvisos(o.avisos, "COT")?.pendiente).length,
    conMaterialPendiente: ofs.filter((o) => o.compras.length > 0).length,
    comprometida:
      abiertas
        .map((o) => o.fechaComprometida)
        .filter((f): f is string => !!f)
        .sort()[0] ?? null,
  };
}

/** «FALDON LATERAL O FRONTAL» → «Faldon lateral o frontal». RPS lo guarda todo
 *  en mayúsculas; en frase se lee mejor y la pantalla no grita. Las siglas
 *  conocidas se respetan. */
export function enFrase(texto: string | null | undefined): string {
  const t = (texto ?? "").trim().toLowerCase();
  if (!t) return "";
  const conSiglas = t.replace(/\b(of|tp|cot|pvc|led|uv|dg|ot|rps)\b/g, (m) => m.toUpperCase());
  return conSiglas.charAt(0).toUpperCase() + conSiglas.slice(1);
}

/** ¿Esta OF tiene un dato distinto del común del pedido? Entonces lo enseña
 *  ella; si coincide, ya está dicho en la cabecera. */
export function difiereDelPedido(
  of: OFBelen,
  resumen: ResumenPedido,
  k: "formaEntrega" | "rotulacion" | "fechaSolicitada",
): boolean {
  const comun = resumen.igual[k] ? resumen.comunes[k] : undefined;
  return comun === undefined ? (of[k] ?? null) !== null : (of[k] ?? null) !== comun;
}
