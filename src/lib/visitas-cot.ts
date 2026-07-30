// ─── Visitas COT: contrato compartido y lógica pura ──────────────────────────
// Este módulo es client-safe: no importa mssql ni toca RPS.

export const VISITAS_COT_PAGE_SIZE = 40;

export type AmbitoVisitasCot = "pendientes" | "historial";
export type EstadoVisitaCot = "pendiente" | "cerrada";

export interface VisitaCot {
  idOrden: string;
  incidencia: string;
  pedido: string | null;
  fechaAviso: string | null;
  fechaVisita: string | null;
  texto: string;
  responsable: string;
  estado: EstadoVisitaCot;
  estadoRps: string;
  solucion: string | null;
  notas: string | null;
}

export interface VisitasCotFiltros {
  ambito: AmbitoVisitasCot;
  page: number;
  q?: string;
  desde?: string;
  hasta?: string;
}

export interface VisitasCotPagina {
  visitas: VisitaCot[];
  hasMore: boolean;
  refreshedAt: string;
}

export interface FilaVisitaCot {
  id: string | null;
  incidencia: string | null;
  pedido: string | null;
  fechaAviso: Date | string | null;
  fechaVisita: Date | string | null;
  texto: string | null;
  responsable: string | null;
  idEstado: string | null;
  estado: string | null;
  solucion: string | null;
  notas: string | null;
}

export interface GrupoVisitasCot {
  fecha: string | null;
  visitas: VisitaCot[];
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function texto(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function fechaValida(value: string | null): string | undefined {
  const limpia = value?.trim() ?? "";
  if (!FECHA_RE.test(limpia)) return undefined;
  const date = new Date(`${limpia}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== limpia
    ? undefined
    : limpia;
}

function aDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fechaSolo(value: Date | string | null): string | null {
  const date = aDate(value);
  if (!date || date.getFullYear() < 2000) return null;
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function fechaHora(value: Date | string | null): string | null {
  const date = aDate(value);
  return !date || date.getFullYear() < 2000 ? null : date.toISOString();
}

/** Convierte parámetros de URL en un contrato seguro y acotado. */
export function normalizarFiltrosVisitasCot(
  params: URLSearchParams,
): VisitasCotFiltros {
  const ambito: AmbitoVisitasCot =
    params.get("ambito") === "historial" ? "historial" : "pendientes";
  const pageRaw = Number(params.get("page") ?? 0);
  const page = Number.isInteger(pageRaw) && pageRaw >= 0 ? pageRaw : 0;
  const q = texto(params.get("q")).slice(0, 120) || undefined;
  const desde = fechaValida(params.get("desde"));
  const hasta = fechaValida(params.get("hasta"));
  return { ambito, page, q, desde, hasta };
}

export function filaAVisitaCot(fila: FilaVisitaCot): VisitaCot {
  const idEstado = texto(fila.idEstado);
  return {
    idOrden: texto(fila.id),
    incidencia: texto(fila.incidencia),
    pedido: texto(fila.pedido) || null,
    fechaAviso: fechaHora(fila.fechaAviso),
    fechaVisita: fechaSolo(fila.fechaVisita),
    texto: texto(fila.texto),
    responsable: texto(fila.responsable) || "Sin asignar",
    estado: idEstado === "001-0" ? "pendiente" : "cerrada",
    estadoRps: texto(fila.estado) || (idEstado === "001-0" ? "Creado" : "Cerrado"),
    solucion: texto(fila.solucion) || null,
    notas: texto(fila.notas) || null,
  };
}

/** Agrupa sin reordenar: la consulta/API ya define el orden cronológico. */
export function agruparVisitasPorFecha(
  visitas: VisitaCot[],
): GrupoVisitasCot[] {
  const grupos: GrupoVisitasCot[] = [];
  for (const visita of visitas) {
    const ultimo = grupos.at(-1);
    if (ultimo?.fecha === visita.fechaVisita) {
      ultimo.visitas.push(visita);
    } else {
      grupos.push({ fecha: visita.fechaVisita, visitas: [visita] });
    }
  }
  return grupos;
}
