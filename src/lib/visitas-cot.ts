import { nombrePersona } from "./nombre-persona";

// ─── Visitas COT: contrato compartido y lógica pura ──────────────────────────
// Este módulo es client-safe: no importa mssql ni toca RPS.

export const VISITAS_COT_PAGE_SIZE = 40;

/** · pendientes → las que quedan por hacer.
 *  · historial  → las cerradas.
 *  · todas      → las dos, que es lo que necesita el calendario: un mes se mira
 *    entero, y esconder la mitad de los días según la pestaña haría que el
 *    calendario contara una cosa distinta de la que enseña. */
export type AmbitoVisitasCot = "pendientes" | "historial" | "todas";
export type EstadoVisitaCot = "pendiente" | "cerrada";

export interface VisitaCot {
  idOrden: string;
  incidencia: string;
  pedido: string | null;
  fechaAviso: string | null;
  fechaVisita: string | null;
  /** El campo de RPS entero, tal cual. Para el detalle y para buscar. */
  texto: string;
  /** Lo que hay que hacer en la visita, sin el encabezado ni la línea de OF que
   *  repiten datos que ya van en columnas (ver `desglosarTexto`). */
  motivo: string;
  /** Cliente, cuando el texto lo trae en la línea de OF. RPS no lo da en una
   *  columna de esta consulta. */
  cliente: string | null;
  /** Comercial que pide la visita, ya puesto como se dice ("Juan José Castro
   *  Mouriño"), no como lo guarda RPS. */
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
  const pedido = params.get("ambito");
  const ambito: AmbitoVisitasCot =
    pedido === "historial" || pedido === "todas" ? pedido : "pendientes";
  const pageRaw = Number(params.get("page") ?? 0);
  const page = Number.isInteger(pageRaw) && pageRaw >= 0 ? pageRaw : 0;
  const q = texto(params.get("q")).slice(0, 120) || undefined;
  const desde = fechaValida(params.get("desde"));
  const hasta = fechaValida(params.get("hasta"));
  return { ambito, page, q, desde, hasta };
}

export function filaAVisitaCot(fila: FilaVisitaCot): VisitaCot {
  const idEstado = texto(fila.idEstado);
  const crudo = texto(fila.texto);
  const { motivo, cliente } = desglosarTexto(crudo);
  return {
    idOrden: texto(fila.id),
    incidencia: texto(fila.incidencia),
    pedido: texto(fila.pedido) || null,
    fechaAviso: fechaHora(fila.fechaAviso),
    fechaVisita: fechaSolo(fila.fechaVisita),
    texto: crudo,
    motivo,
    cliente,
    // RPS guarda "CASTRO MOURIÑO, JUAN JOSE"; en la oficina eso es "Juan José
    // Castro Mouriño". Se traduce AQUÍ, al construir el contrato, para que
    // ninguna vista tenga que acordarse de hacerlo.
    responsable: nombrePersona(texto(fila.responsable)) || "Sin asignar",
    estado: idEstado === "001-0" ? "pendiente" : "cerrada",
    estadoRps: texto(fila.estado) || (idEstado === "001-0" ? "Creado" : "Cerrado"),
    solucion: texto(fila.solucion) || null,
    notas: texto(fila.notas) || null,
  };
}

// ─── El texto del aviso, desmontado ──────────────────────────────────────────
// El campo de RPS no es una frase: es una ficha metida en un `varchar`, y llega
// con esta forma (las dos que se usan en la casa, verificadas en agosto 2026):
//
//   10/08/2026 - CASTRO MOURIÑO, JUAN JOSE - I129976
//
//   EL CORTE INGLES
//   lonas cupulas
//
//   11/08 VISITA PARA OSCAR CON JAIME
//
//   OF 0231158 - PEDIDO AR.26.03914 - PROMOTORA EDUCATIVA CORUÑESA, S. L.
//
// La primera línea repite lo que la fila ya lleva en columnas —la fecha, el
// comercial— y la línea de OF/PEDIDO repite el pedido, que también está en su
// campo. Enseñado tal cual, cada visita ocupaba tres renglones para decir dos
// cosas, y el MOTIVO —lo único que no está en ninguna otra columna— quedaba
// enterrado en medio. Aquí se separan: fuera el encabezado, fuera la línea de
// OF, y lo que queda es el motivo.

/** Encabezado: "10/08/2026 - APELLIDOS, NOMBRE - I129976" o "11/08 VISITA…". */
const ENCABEZADO_RE = /^\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*[-–]?\s/;
/** "OF 0231158 - PEDIDO AR.26.03914 - PROMOTORA EDUCATIVA CORUÑESA, S. L." */
const LINEA_OF_RE = /^\s*OF\s+\d+\s*-\s*PEDIDO\s+\S+\s*(?:-\s*(.+))?$/i;

export function desglosarTexto(crudo: string): { motivo: string; cliente: string | null } {
  const lineas = crudo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lineas.length === 0) return { motivo: "", cliente: null };

  let cliente: string | null = null;
  const cuerpo: string[] = [];
  lineas.forEach((linea, i) => {
    const of = LINEA_OF_RE.exec(linea);
    if (of) {
      cliente = of[1]?.trim() || null;
      return;
    }
    // Solo la PRIMERA línea puede ser encabezado: un "12/09 confirmar medidas"
    // a mitad del cuerpo es motivo, no cabecera.
    if (i === 0 && ENCABEZADO_RE.test(linea)) return;
    cuerpo.push(linea);
  });

  // Sin cuerpo, el encabezado ES lo único que se dijo del aviso ("11/08 VISITA
  // PARA OSCAR CON JAIME"): se enseña, que decir "Sin descripción" teniéndolo
  // delante sería peor.
  return { motivo: cuerpo.join("\n") || lineas[0], cliente };
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
