import type { CompraOF, MaterialAsignado } from "./types";

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
 *  Azul: hay unidades subidas, pero no cuadran con la OF.
 *  Rojo: no se ha subido nada (trabajo sin acabar). */
export type PuntoBultos = "verde" | "azul" | "rojo";

export type EstadoOperacion = "finalizado" | "interrumpido" | "sin_empezar";

export interface OperacionOF {
  codigo: string;
  descripcion: string;
  /** Código de la máquina, o varios juntos («A-CFAC, A-CONF»). */
  maquina: string | null;
  /** Nombre de la máquina o sección, como lo veía Belén («DISEÑO GRAFICO ARZUA»). */
  seccion?: string | null;
  /** Minutos fichados por personas. */
  minutos?: number;
  /** yyyy-mm-dd del último fichaje. */
  ultimoFichaje?: string | null;
  /** yyyy-mm-dd en que se acabó (OLANET o, si no, el cierre de RPS). Solo si
   *  está finalizada. */
  fin?: string | null;
  /** yyyy-mm-dd de inicio y fin según el planificador de RPS. Solo si NO está
   *  finalizada: es lo que va en la columna Fin mientras falta. */
  planInicio?: string | null;
  planFin?: string | null;
  /** Es la tarea en la que se suben los bultos (entrada de producto en RPS). */
  subeBultos?: boolean;
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
  /** ISO yyyy-mm-dd. «F. ENTREGA» de la hoja de ruta: la fecha de fabricación
   *  de la OF en RPS (ManualEndDate). */
  fechaEntrega?: string | null;
  /** Descripción del artículo de la OF. */
  articulo?: string | null;
  /** ISO yyyy-mm-dd. La que dio Producción («F.Compro»). */
  fechaComprometida: string | null;
  /** ISO yyyy-mm-dd. Cuándo llega lo último que falta de compras. */
  fechaCompras: string | null;
  formaEntrega: string | null;
  rotulacion: string | null;
  notas: string | null;
  /** El texto de la línea del pedido: medidas y acabados, lo que lee OT para
   *  plantear (FACOrderLineSL.Comment). */
  detalleLinea?: string | null;
  operaciones: OperacionOF[];
  avisos: AvisoOF[];
  paquetes: PaqueteOF[];
  compras: CompraPendiente[];
  /** La instalación programada: «Prev Logística» en su pantalla de antes. */
  logistica: { fecha: string | null; responsable: string | null } | null;
}

/** Alguien fichando AHORA en una tarea, según OLANET (tgm_fichajes_olanet:
 *  la foto de quién ficha, que OLANET rehace cada pocos minutos). */
export interface FichandoAhora {
  of: string;
  /** El código de tarea TAL CUAL («2» y «02» son tareas distintas). */
  tarea: string;
  persona: string;
  /** Minutos que lleva en este tramo. */
  minutos: number;
  maquina: string | null;
}

export interface PedidoBelen {
  codigo: string;
  cliente: string | null;
  /** Lo que apuntó el comercial en el pedido (FACOrderSL.Comment). */
  comentarioVenta?: string | null;
  ofs: OFBelen[];
}

// ─── Material del pedido ─────────────────────────────────────────────────────
// Las tres manos del material (ver la memoria del flujo y types.ts): lo que OT
// ASIGNÓ a la OF, lo que Almacén RESERVÓ de eso, y lo que Compras PIDIÓ. Lo
// pedido no encadena con lo asignado en RPS (casi siempre es otra cosa: tubo,
// lacado, portes), por eso va en su propia lista.
export interface MaterialOF {
  of: string;
  descripcion: string;
  materiales: MaterialAsignado[];
  compras: CompraOF[];
}

export interface MaterialPedido {
  ofs: MaterialOF[];
}

/** Por dónde se descontó: PDA del almacén, OLANET desde Producción o a mano
 *  en RPS (`_CPRImputationMaterialMO_Custom.Origen` vacío). */
export type OrigenDescuento = "almacen" | "produccion" | "rps";

/** Una línea de material DESCONTADO de una OF: lo que salió de verdad
 *  (CPRImputationMaterialMO, «Imputación de material» en RPS), una por
 *  apunte. Cantidad negativa = devolución. */
export interface LineaDescontada {
  of: string;
  tarea: string | null;
  articulo: string;
  descripcion: string;
  cantidad: number;
  unidad: string | null;
  almacen: string | null;
  operario: string | null;
  /** yyyy-mm-dd */
  fecha: string | null;
  serie: string | null;
  origen: OrigenDescuento;
  /** El comentario del movimiento («10 MTS X 1.54…»), sin la coletilla de OLANET. */
  comentario: string | null;
}

/** ¿La OF está FINALIZADA? Un solo sitio para la comprobación (antes estaba
 *  en cinco). */
export function esFinalizada(situacion: string | null | undefined): boolean {
  return (situacion ?? "").trim().toUpperCase() === "FINALIZADA";
}

/** Los paquetes de una OF juntos por persona y día: «2 paquetes · Ignacio
 *  Penas · 10/11/26» en vez de dos filas iguales. */
export function agruparPaquetes(
  paquetes: readonly PaqueteOF[],
): Array<{ quien: string | null; dia: string | null; paquetes: number; unidades: number }> {
  const grupos = new Map<string, { quien: string | null; dia: string | null; paquetes: number; unidades: number }>();
  for (const p of paquetes) {
    const dia = p.fecha ? p.fecha.slice(0, 10) : null;
    const clave = `${p.quien ?? ""}|${dia ?? ""}`;
    const g = grupos.get(clave) ?? { quien: p.quien, dia, paquetes: 0, unidades: 0 };
    g.paquetes += 1;
    g.unidades += p.unidades;
    grupos.set(clave, g);
  }
  return [...grupos.values()];
}

/** ¿La OF va en amarillo? Cuando tiene visitas (TP/COT) y están TODAS hechas,
 *  como en la app vieja y en la lista «TP o COT sin rematar». Es de la OF, no
 *  del pedido (Belén, 11/11/2026). Una OF sin TP ni COT NO va en amarillo
 *  (Iván, 12/11/2026). Ya no se miran tareas ni bultos (Iván, 14/11/2026):
 *  la 0230837 (AR.26.03703), con el TP hecho el 05/10, no salía amarilla por
 *  la instalación del 17/11 sin empezar, y en la app vieja sí lo está. */
export function ofEnAmarillo(of: Pick<OFBelen, "avisos">): boolean {
  return of.avisos.length > 0 && of.avisos.every((a) => a.cerrado);
}

export function puntoBultos(cantidad: number, subidas: number): PuntoBultos {
  if (!subidas) return "rojo";
  return subidas === cantidad ? "verde" : "azul";
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
  return {
    abiertas: ofs.filter((o) => !esFinalizada(o.situacion)).sort(porOF),
    finalizadas: ofs.filter((o) => esFinalizada(o.situacion)).sort(porOF),
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
  const abiertas = ofs.filter((o) => !esFinalizada(o.situacion));
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
  const bultos: Record<PuntoBultos, number> = { verde: 0, azul: 0, rojo: 0 };
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
    tpPendiente: abiertas.filter((o) => resumenAvisos(o.avisos, "TP")?.pendiente).length,
    cotPendiente: abiertas.filter((o) => resumenAvisos(o.avisos, "COT")?.pendiente).length,
    conMaterialPendiente: abiertas.filter((o) => o.compras.length > 0).length,
    comprometida:
      abiertas
        .map((o) => o.fechaComprometida)
        .filter((f): f is string => !!f)
        .sort()[0] ?? null,
  };
}

/** Una duración EXACTA, sin redondear: «5h 43m 12s», «28m 5s», «45s». Entra
 *  en minutos (con decimales: segundos / 60). */
export function fmtDuracion(minutos: number): string {
  const s = Math.round(minutos * 60);
  if (s <= 0) return "0s";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const partes = [h ? `${h}h` : "", h || m ? `${m}m` : "", seg ? `${seg}s` : ""].filter(Boolean);
  return partes.join(" ");
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

/** Nombre propio (sección, máquina): «DISEÑO GRAFICO ARZUA» → «Diseño Grafico
 *  Arzua». Las palabras cortas de enlace van en minúscula y los códigos con
 *  guion o cifras («OTEC-A») se quedan como están. */
export function enTitulo(texto: string | null | undefined): string {
  const t = (texto ?? "").trim();
  if (!t) return "";
  return t
    .split(/\s+/)
    .map((p, i) => {
      if (/[\d-]/.test(p)) return p;
      const min = p.toLowerCase();
      if (i > 0 && /^(de|del|la|las|el|los|y|e|a|en)$/.test(min)) return min;
      return min.charAt(0).toUpperCase() + min.slice(1);
    })
    .join(" ");
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

// ─── Tareas y tiempos del pedido ─────────────────────────────────────────────
// Belén (09/11/2026) quiere ver TODAS las tareas y el tiempo de cada persona,
// con las fechas en que fichó. RPS guarda cada fichaje con el día, la hora en
// que se registró y los minutos (CPRImputationMO, ResourceType = 1 = persona;
// la misma regla que el Historial).

export interface FichajeBelen {
  persona: string;
  /** yyyy-mm-dd */
  dia: string;
  /** «HH:MM» en que acabó. */
  horaFin?: string | null;
  /** «HH:MM» en que se registró en RPS; null si no se sabe. */
  hora: string | null;
  minutos: number;
}

/** Una fila tal como llega de RPS: una por fichaje, o una sola sin fichaje
 *  (persona null) para que salgan también las tareas que nadie ha tocado. */
export interface FilaTiempo {
  of: string;
  ofDescripcion: string;
  tarea: string;
  descripcion: string;
  maquina: string | null;
  estado: EstadoOperacion;
  /** Tarea de visita (TP/COT): no es trabajo de taller y no cuenta como
   *  operación acabada o pendiente. */
  visita?: boolean;
  persona: string | null;
  dia: string | null;
  hora: string | null;
  horaFin?: string | null;
  minutos: number;
}

export interface PersonaEnTarea {
  persona: string;
  minutos: number;
  fichajes: FichajeBelen[];
}

export interface TareaTiempos {
  of: string;
  codigo: string;
  descripcion: string;
  maquina: string | null;
  estado: EstadoOperacion;
  visita?: boolean;
  minutos: number;
  personas: PersonaEnTarea[];
}

export interface OFTiempos {
  of: string;
  descripcion: string;
  minutos: number;
  tareas: TareaTiempos[];
}

export interface PersonaTiempos {
  persona: string;
  minutos: number;
  /** Días distintos en que fichó. */
  dias: number;
  primerDia: string | null;
  ultimoDia: string | null;
  fichajes: Array<FichajeBelen & { of: string; tarea: string; descripcion: string }>;
}

export interface TiemposPedido {
  minutos: number;
  ofs: OFTiempos[];
  personas: PersonaTiempos[];
}

const porFecha = (a: { dia: string; hora: string | null }, b: { dia: string; hora: string | null }) =>
  a.dia.localeCompare(b.dia) || (a.hora ?? "").localeCompare(b.hora ?? "");

/** Del detalle de RPS (una fila por fichaje) a las dos maneras de mirarlo: por
 *  OF y tarea, y por persona. Las tareas van en el orden de su código como
 *  número («2» antes que «10»); las personas, de más a menos tiempo. Los
 *  fichajes de 0 minutos se cuentan (dicen que alguien estuvo) pero no suman. */
export function agruparTiempos(filas: readonly FilaTiempo[]): TiemposPedido {
  const ofs = new Map<string, OFTiempos>();
  const tareas = new Map<string, TareaTiempos>();
  const personas = new Map<string, PersonaTiempos>();

  for (const f of filas) {
    let of = ofs.get(f.of);
    if (!of) {
      of = { of: f.of, descripcion: f.ofDescripcion, minutos: 0, tareas: [] };
      ofs.set(f.of, of);
    }
    const claveTarea = `${f.of}|${f.tarea}`;
    let tarea = tareas.get(claveTarea);
    if (!tarea) {
      tarea = {
        of: f.of,
        codigo: f.tarea,
        descripcion: f.descripcion,
        maquina: f.maquina,
        estado: f.estado,
        visita: f.visita,
        minutos: 0,
        personas: [],
      };
      tareas.set(claveTarea, tarea);
      of.tareas.push(tarea);
    }
    if (!f.persona || !f.dia) continue;

    const fichaje: FichajeBelen = { persona: f.persona, dia: f.dia, hora: f.hora, horaFin: f.horaFin ?? null, minutos: f.minutos };
    tarea.minutos += f.minutos;
    of.minutos += f.minutos;
    let enTarea = tarea.personas.find((p) => p.persona === f.persona);
    if (!enTarea) {
      enTarea = { persona: f.persona, minutos: 0, fichajes: [] };
      tarea.personas.push(enTarea);
    }
    enTarea.minutos += f.minutos;
    enTarea.fichajes.push(fichaje);

    let p = personas.get(f.persona);
    if (!p) {
      p = { persona: f.persona, minutos: 0, dias: 0, primerDia: null, ultimoDia: null, fichajes: [] };
      personas.set(f.persona, p);
    }
    p.minutos += f.minutos;
    p.fichajes.push({ ...fichaje, of: f.of, tarea: f.tarea, descripcion: f.descripcion });
  }

  const numero = (c: string) => (/^\d+$/.test(c) ? Number(c) : Number.MAX_SAFE_INTEGER);
  for (const of of ofs.values()) {
    of.tareas.sort((a, b) => numero(a.codigo) - numero(b.codigo) || a.codigo.localeCompare(b.codigo));
    for (const t of of.tareas) {
      t.personas.sort((a, b) => b.minutos - a.minutos);
      for (const p of t.personas) p.fichajes.sort(porFecha);
    }
  }
  for (const p of personas.values()) {
    p.fichajes.sort(porFecha);
    const dias = [...new Set(p.fichajes.map((f) => f.dia))].sort();
    p.dias = dias.length;
    p.primerDia = dias[0] ?? null;
    p.ultimoDia = dias[dias.length - 1] ?? null;
  }

  const listaOfs = [...ofs.values()].sort((a, b) => a.of.localeCompare(b.of));
  return {
    minutos: listaOfs.reduce((s, o) => s + o.minutos, 0),
    ofs: listaOfs,
    personas: [...personas.values()].sort((a, b) => b.minutos - a.minutos),
  };
}

/** Las personas que han fichado en UNA OF, de más a menos tiempo, con sus
 *  fichajes por fecha: la vista «Por persona» del desplegable de la OF. */
export function personasDeOF(of: OFTiempos): PersonaTiempos[] {
  const porPersona = new Map<string, PersonaTiempos>();
  for (const t of of.tareas) {
    for (const p of t.personas) {
      const yo = porPersona.get(p.persona) ?? { persona: p.persona, minutos: 0, dias: 0, primerDia: null, ultimoDia: null, fichajes: [] };
      yo.minutos += p.minutos;
      yo.fichajes.push(...p.fichajes.map((f) => ({ ...f, of: of.of, tarea: t.codigo, descripcion: t.descripcion })));
      porPersona.set(p.persona, yo);
    }
  }
  for (const p of porPersona.values()) {
    p.fichajes.sort((a, b) => a.dia.localeCompare(b.dia) || (a.hora ?? "").localeCompare(b.hora ?? ""));
    const dias = [...new Set(p.fichajes.map((f) => f.dia))].sort();
    p.dias = dias.length;
    p.primerDia = dias[0] ?? null;
    p.ultimoDia = dias[dias.length - 1] ?? null;
  }
  return [...porPersona.values()].sort((a, b) => b.minutos - a.minutos);
}
