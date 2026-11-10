// ─── Vista de Belén: las listas de comprobación ──────────────────────────────
// Client-safe. Cada lista es una hoja de sus Excels con macros, convertida en
// una tabla de su pantalla. La pantalla no sabe nada de cada una: pinta las
// columnas que se declaran aquí, y al pinchar una fila abre su pedido.
//
// Añadir una lista = una entrada en LISTAS_BELEN (aquí) + su consulta en
// server/vista-belen-listas-db.ts. Nada más.
//
// Solo pedidos AR (Belén, 09/11/2026: «de SA y BE no los reviso»); el buscador
// de pedidos, en cambio, encuentra cualquier serie.

export type IdLista =
  | "una-tarea"
  | "bultos-subidos"
  | "desfase"
  | "fechas-comprometidas"
  | "varias-maquinas"
  | "sin-descripcion";

/** Cómo se pinta el valor. `of` y `pedido` van en negrita y monoespaciado;
 *  `fecha` espera ISO (yyyy-mm-dd) y sale dd/mm/aa; `numero` alineado a la
 *  derecha. */
export type TipoColumna = "texto" | "numero" | "fecha" | "of" | "pedido" | "estado";

export interface ColumnaLista {
  clave: string;
  titulo: string;
  tipo?: TipoColumna;
  /** Recorta con «…» a este ancho (clase de Tailwind, p. ej. "max-w-[16rem]"). */
  ancho?: string;
}

export interface DefLista {
  id: IdLista;
  /** Corto: es la etiqueta del selector, y cabe en un monitor pequeño. */
  label: string;
  /** Una frase: qué sale en la lista. */
  explica: string;
  columnas: ColumnaLista[];
}

/** Una fila. `of` y `pedido` son obligatorios (null si no hay) porque de ellos
 *  depende poder abrir el pedido al pinchar. `clave` la hace única. */
export type FilaLista = {
  clave: string;
  of: string | null;
  pedido: string | null;
} & Record<string, string | number | null>;

const COLUMNAS_TAREA: ColumnaLista[] = [
  { clave: "prioridad", titulo: "Prio.", tipo: "numero" },
  { clave: "of", titulo: "OF", tipo: "of" },
  { clave: "pedido", titulo: "Pedido", tipo: "pedido" },
  { clave: "cliente", titulo: "Cliente", ancho: "max-w-[15rem]" },
  { clave: "tarea", titulo: "Tarea pendiente", ancho: "max-w-[22rem]" },
  { clave: "maquina", titulo: "Máquina" },
  { clave: "situacion", titulo: "Situación", tipo: "estado" },
  { clave: "fechaSolicitada", titulo: "F. sol.", tipo: "fecha" },
];

export const LISTAS_BELEN: readonly DefLista[] = [
  {
    id: "una-tarea",
    label: "1 tarea sin finalizar",
    explica: "OF a las que solo les queda una operación por acabar.",
    columnas: COLUMNAS_TAREA,
  },
  {
    id: "bultos-subidos",
    label: "Pendientes con bultos subidos",
    explica: "Operaciones sin acabar en OF que ya tienen todas sus unidades subidas.",
    columnas: COLUMNAS_TAREA,
  },
  {
    id: "desfase",
    label: "Desfase de unidades",
    explica: "OF con unidades subidas que no coinciden con las que hay que fabricar.",
    columnas: [
      { clave: "of", titulo: "OF", tipo: "of" },
      { clave: "pedido", titulo: "Pedido", tipo: "pedido" },
      { clave: "cliente", titulo: "Cliente", ancho: "max-w-[15rem]" },
      { clave: "articulo", titulo: "Artículo", ancho: "max-w-[22rem]" },
      { clave: "cantidadOF", titulo: "Unid. OF", tipo: "numero" },
      { clave: "cantidadSubida", titulo: "Subidas", tipo: "numero" },
      { clave: "diferencia", titulo: "Diferencia", tipo: "numero" },
      { clave: "formaEntrega", titulo: "Forma de entrega" },
      { clave: "fechaFabricacion", titulo: "F. fabricación", tipo: "fecha" },
      { clave: "fechaExigida", titulo: "F. exigida", tipo: "fecha" },
    ],
  },
  {
    id: "fechas-comprometidas",
    label: "Fechas comprometidas",
    explica: "OF con fecha dada por Producción y unidades todavía sin facturar.",
    columnas: [
      { clave: "prioridad", titulo: "Prio.", tipo: "numero" },
      { clave: "of", titulo: "OF", tipo: "of" },
      { clave: "pedido", titulo: "Pedido", tipo: "pedido" },
      { clave: "cliente", titulo: "Cliente", ancho: "max-w-[15rem]" },
      { clave: "articulo", titulo: "Artículo", ancho: "max-w-[22rem]" },
      { clave: "formaEntrega", titulo: "Forma de entrega" },
      { clave: "fechaComprometida", titulo: "F. comprometida", tipo: "fecha" },
      { clave: "bultosSubidos", titulo: "Bultos subidos", tipo: "estado" },
    ],
  },
  {
    id: "varias-maquinas",
    label: "Varias máquinas en una operación",
    explica: "Operaciones de OF abiertas que tienen asignada más de una máquina.",
    columnas: [
      { clave: "of", titulo: "OF", tipo: "of" },
      { clave: "pedido", titulo: "Pedido", tipo: "pedido" },
      { clave: "cliente", titulo: "Cliente", ancho: "max-w-[15rem]" },
      { clave: "tarea", titulo: "Operación", ancho: "max-w-[22rem]" },
      { clave: "maquinas", titulo: "Máquinas", ancho: "max-w-[22rem]" },
    ],
  },
  {
    id: "sin-descripcion",
    label: "OF sin descripción",
    explica: "OF abiertas cuya descripción falta o solo contiene espacios.",
    columnas: [
      { clave: "of", titulo: "OF", tipo: "of" },
      { clave: "pedido", titulo: "Pedido", tipo: "pedido" },
      { clave: "cliente", titulo: "Cliente", ancho: "max-w-[15rem]" },
      { clave: "cantidad", titulo: "Unidades", tipo: "numero" },
      { clave: "fechaInicio", titulo: "F. inicio prevista", tipo: "fecha" },
      { clave: "referencia", titulo: "Referencia", ancho: "max-w-[22rem]" },
    ],
  },
];

export function esIdLista(v: unknown): v is IdLista {
  return LISTAS_BELEN.some((l) => l.id === v);
}
