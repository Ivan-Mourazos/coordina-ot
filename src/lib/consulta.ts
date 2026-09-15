import { fmtDiaMesAno } from "./fechas";
import type { DondeOF } from "./consulta-donde";
import {
  coincideBusqueda,
  type BaseHistorial,
  type IndiceHistorial,
  type InfoPedidoHistorial,
} from "./historial-indice";
import { SECCION_POR_DEFECTO } from "./secciones";

// ─── La consulta sin login: qué pedidos salen y cómo se cuentan ──────────────
// Una sola lista para toda la casa. Se entra buscando, y sin buscar se ven las
// próximas entregas. Lo que decide si un pedido está pendiente es la ENTREGA,
// no las tareas: RPS tiene 109.566 pedidos entregados con alguna fase sin
// cerrar, y la entrega la mantiene administración con los albaranes (spec
// 2026-09-15-consulta-publica-v2-design.md). Sin base de datos, para probarlo.

export const PAGE_CONSULTA = 40;

/** Hoy y los catorce días siguientes: la lista corta de «qué sale esta semana
 *  y la que viene». */
export const DIAS_PROXIMAS = 14;

export type EstadoConsulta = "proximas" | "fuera" | "fabrica" | "salir" | "entregados" | "todos";

export const ESTADOS_CONSULTA: { id: EstadoConsulta; label: string }[] = [
  { id: "proximas", label: "Próximas entregas" },
  { id: "fuera", label: "Fuera de plazo" },
  { id: "fabrica", label: "En fábrica" },
  { id: "salir", label: "Esperando salir" },
  { id: "entregados", label: "Entregados" },
  { id: "todos", label: "Todos" },
];

export type PasoConsulta = "ot" | "diseno" | "taller";

export const PASOS_CONSULTA: { id: PasoConsulta; label: string }[] = [
  { id: "ot", label: "Oficina Técnica" },
  { id: "diseno", label: "Diseño Gráfico" },
  { id: "taller", label: "Taller" },
];

export type SituacionPedido = "fabrica" | "salir" | "entregado";

export interface FiltrosConsulta {
  estado: EstadoConsulta;
  /** Solo filtra lo que está en fábrica (ver `normalizarFiltrosConsulta`). */
  paso?: PasoConsulta;
  familia?: string;
  /** ISO yyyy-mm-dd, inclusive, sobre la fecha de la fila (`diaDeFila`). */
  desde?: string;
  hasta?: string;
  q?: string;
  page: number;
}

export interface PaginaConsulta {
  filas: BaseHistorial[];
  hasMore: boolean;
  /** Familias presentes con los demás filtros puestos: elegir una nunca deja
   *  la lista en blanco. */
  familias: string[];
  /** Pedidos por día de la consulta ENTERA (clave yyyy-mm-dd o "sin-fecha"),
   *  o null cuando la lista no va por días (buscando o «Todos»). */
  porDia: Record<string, number> | null;
  /** El estado con el que se filtró de verdad (ver `estadoEfectivo`). */
  estado: EstadoConsulta;
}

/** ms → yyyy-mm-dd. Las dos fechas son de día sin hora en RPS
 *  (ReceptionDemandDate, DeliveryNoteDate) y llegan a medianoche UTC:
 *  cortando en UTC no se corren de día. */
export const diaIso = (ms: number | null): string | null =>
  ms === null ? null : new Date(ms).toISOString().slice(0, 10);

// El servidor va en UTC y la oficina en Europe/Madrid: a las 22:30 de un día
// de verano, `new Date()` en UTC todavía dice ayer, y la ventana de «próximas
// entregas» se corría un día entero (y «fuera de plazo» tardaba dos horas de
// más en encenderse). El mismo corte que ya usa el índice del Historial.
const DIA_OFICINA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Hoy, en la zona de la oficina (yyyy-mm-dd). */
export const hoyEnOficina = (): string => DIA_OFICINA.format(new Date());

export function sumaDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Entregado manda: no se entrega un pedido sin hacerlo. Sin entregar, el
 *  trabajo que queda (regla de FINALIZAR, en el índice) separa fábrica de
 *  esperando salir. */
export function situacionDe(b: Pick<BaseHistorial, "pendienteEntrega" | "trabajoAbierto">): SituacionPedido {
  if (!b.pendienteEntrega) return "entregado";
  return b.trabajoAbierto ? "fabrica" : "salir";
}

/** «Próximas entregas» es la pantalla de entrada, no una elección: quien
 *  escribe en el buscador quiere el pedido esté como esté. Cualquier otro
 *  estado lo eligió a mano, y se respeta. */
export function estadoEfectivo(f: Pick<FiltrosConsulta, "estado" | "q">): EstadoConsulta {
  return f.estado === "proximas" && f.q?.trim() ? "todos" : f.estado;
}

/** La fecha que se lee en la fila y que agrupa: la de salida si ya salió, la
 *  solicitada si no. */
export function diaDeFila(b: BaseHistorial): string | null {
  return situacionDe(b) === "entregado" ? diaIso(b.fechaEntregado) : diaIso(b.fechaEntrega);
}

// ─── Lo que se calcula UNA vez por índice ───────────────────────────────────
// Filtrar son 153.000 filas, y hacerlo en el proceso que también sirve al
// equipo obliga a mirar lo que cuesta: sacar la fecha en ISO de cada fila (dos
// `new Date().toISOString()` por pedido) eran 348 ms de CPU por búsqueda, y
// buscando se recorre TODO (ver `estadoEfectivo`). Aquí se prepara una sola
// vez por índice —que se rehace cada 30 minutos— y las peticiones solo
// comparan textos ya hechos.
//
// De paso se guarda el pedido en un Map: la ficha lo buscaba recorriendo las
// 153.000 filas cada vez que alguien desplegaba una.

interface FilaLista {
  b: BaseHistorial;
  situacion: SituacionPedido;
  /** La entrega solicitada, ISO. */
  entrega: string | null;
  /** La fecha que se lee y que agrupa (`diaDeFila`). */
  dia: string | null;
  familias: string[];
  /** Le queda trabajo de Diseño Gráfico (sale de la otra sección del índice). */
  deDiseno: boolean;
}

interface Preparado {
  filas: FilaLista[];
  porPedido: Map<string, BaseHistorial>;
}

const preparadoPorIndice = new WeakMap<IndiceHistorial, Preparado>();

function prepararIndice(indice: IndiceHistorial): Preparado {
  const ya = preparadoPorIndice.get(indice);
  if (ya) return ya;
  // Las dos secciones llevan los MISMOS pedidos; la de diseño solo hace falta
  // para saber si le queda trabajo de Diseño Gráfico.
  const diseno = new Map(indice.base.diseno.map((b) => [b.pedido, b]));
  const filas: FilaLista[] = [];
  const porPedido = new Map<string, BaseHistorial>();
  for (const b of indice.base[SECCION_POR_DEFECTO]) {
    const situacion = situacionDe(b);
    filas.push({
      b,
      situacion,
      entrega: diaIso(b.fechaEntrega),
      dia: situacion === "entregado" ? diaIso(b.fechaEntregado) : diaIso(b.fechaEntrega),
      familias: indice.info.get(b.pedido)?.familias ?? [],
      deDiseno: diseno.get(b.pedido)?.pendienteSeccion ?? false,
    });
    porPedido.set(b.pedido, b);
  }
  const preparado = { filas, porPedido };
  preparadoPorIndice.set(indice, preparado);
  return preparado;
}

/** El pedido tal como está en el índice, sin recorrerlo entero. */
export function filaDelIndice(indice: IndiceHistorial, pedido: string): BaseHistorial | null {
  return prepararIndice(indice).porPedido.get(pedido) ?? null;
}

/** Refleja las tareas TAL COMO ESTÁN en RPS: una de OT olvidada abierta hace
 *  que salga en Oficina Técnica. Taller es lo que queda, por descarte. */
function enPaso(paso: PasoConsulta, fila: FilaLista): boolean {
  const deOt = fila.b.pendienteSeccion;
  if (paso === "ot") return deOt;
  if (paso === "diseno") return fila.deDiseno;
  return !deOt && !fila.deDiseno;
}

/** Por fecha, y los que no tienen al final: un pedido sin fecha no es urgente,
 *  es un pedido del que no se sabe. */
const ascNulosAlFinal = (a: string | null, b: string | null): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
};

export function filtrarConsulta(indice: IndiceHistorial, f: FiltrosConsulta, hoy: string): PaginaConsulta {
  const estado = estadoEfectivo(f);
  const q = f.q?.trim() ?? "";
  const coincide = q ? coincideBusqueda(q) : null;
  const limite = sumaDias(hoy, DIAS_PROXIMAS);
  const familia = f.familia?.trim() || null;
  // El paso solo filtra lo que está en fábrica, así que se cae cuando la
  // búsqueda levanta el estado de entrada («Próximas entregas» → «Todos», ver
  // `estadoEfectivo`): si no, la pantalla prometía buscar en todos los pedidos
  // y devolvía vacío porque seguía exigiendo un paso de fábrica.
  const paso = estado === f.estado ? f.paso : undefined;

  const sinFamilia: FilaLista[] = [];
  for (const fila of prepararIndice(indice).filas) {
    const { situacion, entrega, dia } = fila;
    if (estado === "proximas" && (situacion === "entregado" || entrega === null || entrega < hoy || entrega > limite)) continue;
    if (estado === "fuera" && (situacion === "entregado" || entrega === null || entrega >= hoy)) continue;
    if (estado === "fabrica" && situacion !== "fabrica") continue;
    if (estado === "salir" && situacion !== "salir") continue;
    if (estado === "entregados" && situacion !== "entregado") continue;
    if (paso && (situacion !== "fabrica" || !enPaso(paso, fila))) continue;
    if (f.desde && (dia === null || dia < f.desde)) continue;
    if (f.hasta && (dia === null || dia > f.hasta)) continue;
    if (coincide && !coincide(fila.b.pedido, indice.info.get(fila.b.pedido))) continue;
    sinFamilia.push(fila);
  }

  const cuenta = new Map<string, number>();
  for (const { familias } of sinFamilia) for (const fam of familias) cuenta.set(fam, (cuenta.get(fam) ?? 0) + 1);
  const familias = [...cuenta].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).map(([fam]) => fam);

  const lista = familia ? sinFamilia.filter((x) => x.familias.includes(familia)) : sinFamilia;
  if (estado === "todos") {
    // Buscando manda lo reciente: el pedido que se busca casi siempre es de
    // estos meses, aunque la búsqueda llegue a 2019.
    lista.sort((x, y) => (y.b.fechaPedido ?? -Infinity) - (x.b.fechaPedido ?? -Infinity) || y.b.pedido.localeCompare(x.b.pedido));
  } else if (estado === "entregados") {
    // Lo último que salió primero; los que no tienen albarán, al final.
    lista.sort((x, y) => {
      if (x.dia !== y.dia) {
        if (x.dia === null) return 1;
        if (y.dia === null) return -1;
        return x.dia < y.dia ? 1 : -1;
      }
      return y.b.pedido.localeCompare(x.b.pedido);
    });
  } else {
    lista.sort((x, y) => ascNulosAlFinal(x.dia, y.dia) || x.b.pedido.localeCompare(y.b.pedido));
  }

  let porDia: Record<string, number> | null = null;
  if (estado !== "todos") {
    porDia = {};
    for (const { dia } of lista) {
      const clave = dia ?? "sin-fecha";
      porDia[clave] = (porDia[clave] ?? 0) + 1;
    }
  }

  const off = Math.max(0, f.page) * PAGE_CONSULTA;
  const trozo = lista.slice(off, off + PAGE_CONSULTA + 1).map((x) => x.b);
  return { filas: trozo.slice(0, PAGE_CONSULTA), hasMore: trozo.length > PAGE_CONSULTA, familias, porDia, estado };
}

const ESTADOS = new Set<string>(ESTADOS_CONSULTA.map((e) => e.id));
const PASOS = new Set<string>(PASOS_CONSULTA.map((p) => p.id));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Los filtros tal como llegan de la URL. NUNCA lanza: esto viene de fuera y
 *  un valor raro no puede tumbar la página de nadie. */
export function normalizarFiltrosConsulta(sp: URLSearchParams): FiltrosConsulta {
  const texto = (k: string) => sp.get(k)?.trim() || undefined;
  const fecha = (k: string) => {
    const v = texto(k);
    return v && ISO.test(v) ? v : undefined;
  };
  const crudo = sp.get("estado") ?? "";
  const estado = (ESTADOS.has(crudo) ? crudo : "proximas") as EstadoConsulta;
  const pasoCrudo = sp.get("paso") ?? "";
  // «Esperando salir» y «Entregados» no están en fábrica: un paso ahí dejaría
  // la lista vacía sin decir por qué.
  const paso = PASOS.has(pasoCrudo) && estado !== "salir" && estado !== "entregados"
    ? (pasoCrudo as PasoConsulta)
    : undefined;
  const page = Number(sp.get("page"));
  const f: FiltrosConsulta = { estado, page: Number.isInteger(page) && page >= 0 ? page : 0 };
  if (paso) f.paso = paso;
  const q = texto("q");
  if (q) f.q = q;
  const familia = texto("familia");
  if (familia) f.familia = familia;
  const desde = fecha("desde");
  if (desde) f.desde = desde;
  const hasta = fecha("hasta");
  if (hasta) f.hasta = hasta;
  return f;
}

/** «Entrega 18/09/26», «Entregado el 09/09/26» o «Entregado» a secas: sin
 *  albarán enlazado no se pone ninguna otra fecha en su lugar. Con año: la
 *  búsqueda llega a pedidos de hace años. */
export function textoFecha(p: {
  situacion: SituacionPedido;
  fechaEntrega: string | null;
  fechaEntregado: string | null;
}): string {
  if (p.situacion === "entregado") {
    return p.fechaEntregado ? `Entregado el ${fmtDiaMesAno(p.fechaEntregado)}` : "Entregado";
  }
  return p.fechaEntrega ? `Entrega ${fmtDiaMesAno(p.fechaEntrega)}` : "Sin fecha de entrega";
}

/** Una fila de la lista tal como sale de casa: nada que no se pinte. */
export interface PedidoConsulta {
  codigo: string;
  cliente: string | null;
  negocio: string | null;
  ciudadEntrega: string | null;
  situacion: SituacionPedido;
  fechaEntrega: string | null;
  /** Solo si ya salió: una fecha de salida en un pedido sin entregar sería de
   *  una entrega parcial, y la fila diría que salió cuando no. */
  fechaEntregado: string | null;
  /** El día que agrupa la fila (`diaDeFila`). */
  dia: string | null;
  fueraDePlazo: boolean;
  familias: string[];
  /** Solo en fábrica; vacío en lo demás. */
  donde: DondeOF[];
}

export interface RespuestaConsulta {
  pedidos: PedidoConsulta[];
  hasMore: boolean;
  familias: string[];
  porDia: Record<string, number> | null;
  estado: EstadoConsulta;
}

export function pedidoConsulta(
  b: BaseHistorial,
  info: InfoPedidoHistorial | undefined,
  donde: DondeOF[],
  hoy: string,
): PedidoConsulta {
  const situacion = situacionDe(b);
  const fechaEntrega = diaIso(b.fechaEntrega);
  return {
    codigo: b.pedido,
    cliente: info?.cliente ?? null,
    negocio: info?.negocio ?? null,
    ciudadEntrega: info?.ciudadEntrega ?? null,
    situacion,
    fechaEntrega,
    fechaEntregado: situacion === "entregado" ? diaIso(b.fechaEntregado) : null,
    dia: diaDeFila(b),
    fueraDePlazo: situacion !== "entregado" && fechaEntrega !== null && fechaEntrega < hoy,
    familias: info?.familias ?? [],
    donde,
  };
}
