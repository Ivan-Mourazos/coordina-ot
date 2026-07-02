// ─── Modelo de dominio CoordinaOT ───────────────────────────────────────────
// Lo que se escanea y llega de Producción a Oficina Técnica es un PEDIDO (AR...).
// Un pedido contiene una o varias OF (Órdenes de Fabricación). Los datos de las
// OF viven DENTRO del pedido: el pedido nunca se repite por su número de OFs.
//
// El trabajo es por OF y tiene DOS roles distintos:
//   · AUTOR   → quien "plantea" la OF (operario asignado en el tablero).
//   · REVISOR → un compañero (≠ autor) que repasa antes de mandar a Producción.
// Normalmente un mismo operario plantea todas las OF de un pedido, pero una OF
// puede acabar haciéndola otro: por eso autor y revisor viven a nivel de OF.
//
// Tiempos: planteo (autor) + revisión (revisor) SUMAN al total de la OF, pero se
// guardan por separado para saber quién plantea y quién revisa.
//
// Estas formas son el contrato que consume la UI. El mock (lib/mock.ts) las
// rellena hoy; mañana el adaptador SQL Server / RPS devolverá lo mismo.

export type Familia =
  | "TOLDO"
  | "SUMINISTRO"
  | "REMOLQUE"
  | "LONA"
  | "CARPA"
  | "TAPIZADO"
  | "REPARACION";

export type Prioridad = 1 | 2 | 3; // 1 = máxima urgencia

/** Situación respecto a Producción.
 *  - procesado: ya escaneado, con OF asignada y pasado a Oficina Técnica
 *    (= "completamente grabado"). Es el trabajo real de OT.
 *  - pendiente: aún no procesado por Producción. No entra en el tablero de
 *    trabajo; solo se puede consultar/buscar en la Lista. */
export type Situacion = "procesado" | "pendiente" | "completado";

/** Ciclo de vida de una OF. */
export type EstadoOF =
  | "pendiente" // sin autor o sin empezar
  | "en_curso" // el autor la está planteando
  | "por_revisar" // planteo terminado, falta asignar/empezar revisor
  | "en_revision" // un revisor (≠ autor) la está repasando
  | "aprobada" // revisada OK → lista para Producción
  | "devuelta" // el revisor la devolvió con observaciones
  | "anulada"; // OF que no se hace en OT

export type Rol = "plantear" | "revisar";

export interface Operario {
  id: string;
  nombre: string;
  iniciales: string;
  color: string; // acento del encabezado de su zona
}

/** Orden de Fabricación: una unidad del pedido (p.ej. cada remolque). */
export interface OF {
  id: string;
  codigo: string; // p.ej. "OF-01"
  descripcion: string;
  familia: Familia;
  piezas: number;

  /** Autor = operario que plantea. null = sin asignar (bandeja). */
  autorId: string | null;
  /** Revisor (≠ autor). null mientras no se asigne. */
  revisorId: string | null;
  estado: EstadoOF;
  observacion?: string; // motivo si fue devuelta

  /** Si se está fichando ahora mismo, con qué rol. */
  fichandoRol: Rol | null;
  tiempoEstimadoMin: number;
  tiempoPlanteoMin: number; // acumulado por el/los autores
  tiempoRevisionMin: number; // acumulado por el/los revisores
  /** Archivos del planteamiento subidos a RPS (solo OF aprobadas). */
  archivosRps?: string[];
}

/** Pedido = lo que se escanea (un parte). Code "AR…". Contiene sus OF. */
export interface Pedido {
  id: string;
  codigo: string; // p.ej. "AR2605555"
  cliente: string;
  situacion: Situacion;
  fechaSolicitud: string; // ISO yyyy-mm-dd
  /** Fecha que Producción planifica antes de enviarlo a Oficina Técnica.
   *  Es la fecha por la que se ordena la lista de trabajo. */
  fechaPlanificacion: string; // ISO yyyy-mm-dd
  fechaEntrega: string; // ISO yyyy-mm-dd
  prioridad: Prioridad;
  ofs: OF[];

  /** URL de la 1ª página del PDF del pedido (foto). Cuando RPS la dé, la
   *  tarjeta muestra la imagen real en lugar de la réplica dibujada. */
  scanUrl?: string;

  // --- pistas visuales para simular el "parte escaneado" ---
  accent: "verde" | "rojo" | "azul" | "ninguno"; // círculo a mano del scan
  lineas: number; // nº de renglones de texto manuscrito simulado
  croquis: boolean; // lleva un dibujo/croquis
}

// ─── Helpers derivados (sin estado) ──────────────────────────────────────────

export type EstadoAsignacion = "sin" | "parcial" | "completo";

export function familiasDe(p: Pedido): Familia[] {
  return [...new Set(p.ofs.map((of) => of.familia))];
}

export function piezasTotal(p: Pedido): number {
  return p.ofs.reduce((n, of) => n + of.piezas, 0);
}

/** OFs cuyo AUTOR es `autorId` (null = bandeja sin asignar). */
export function ofsDe(p: Pedido, autorId: string | null): OF[] {
  return p.ofs.filter((of) => of.autorId === autorId);
}

export function estadoAsignacion(p: Pedido): EstadoAsignacion {
  const asignadas = p.ofs.filter((of) => of.autorId !== null).length;
  if (asignadas === 0) return "sin";
  if (asignadas === p.ofs.length) return "completo";
  return "parcial";
}

export function tiempoTotalOF(of: OF): number {
  return of.tiempoPlanteoMin + of.tiempoRevisionMin;
}

export function tiempoTotalPedido(p: Pedido): number {
  return p.ofs.reduce((n, of) => n + tiempoTotalOF(of), 0);
}

/** Today en ISO yyyy-mm-dd (zona local). */
export function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Finalizado = todas sus OF aprobadas (revisadas, listas para Producción). */
export function estaFinalizado(p: Pedido): boolean {
  return p.ofs.length > 0 && p.ofs.every((o) => o.estado === "aprobada");
}

/** Atrasado = pasó la fecha de planificación y aún no está finalizado. */
export function estaAtrasado(p: Pedido, hoy: string): boolean {
  return p.fechaPlanificacion < hoy && !estaFinalizado(p);
}

export function algunFichando(p: Pedido, autorId?: string | null): boolean {
  return p.ofs.some(
    (of) =>
      of.fichandoRol !== null &&
      (autorId === undefined || of.autorId === autorId),
  );
}
