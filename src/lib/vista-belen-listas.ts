// ─── Vista de Belén: las listas de comprobación ──────────────────────────────
// Client-safe. Cada lista es una hoja de sus Excels con macros, convertida en
// una tabla de su pantalla. La pantalla no sabe nada de cada una: pinta las
// columnas que se declaran aquí, y al pinchar una fila abre su pedido.
//
// Añadir una lista = una entrada en LISTAS_BELEN (aquí) + su consulta en
// server/vista-belen-listas-db.ts. Nada más.
//
// Solo pedidos AR (Belén, 09/11/2026: «de SA y BE no los reviso»), salvo el
// desfase de unidades, que desde el 10/11/2026 trae también las delegaciones
// (SA y BE). El buscador de pedidos encuentra cualquier serie.

export type IdLista =
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
  /** De qué pedidos sale. Sin esto, «Solo pedidos AR.». */
  alcance?: string;
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
  { clave: "fechaSolicitada", titulo: "Solicitada", tipo: "fecha" },
];

export const LISTAS_BELEN: readonly DefLista[] = [
  // Belén (10/11/2026): antes eran dos listas, «1 tarea sin finalizar» y
  // «Pendientes con bultos subidos». Las dos eran lo mismo —bultos subidos y
  // algo sin acabar— y solo cambiaba cuántas tareas quedaban.
  {
    id: "bultos-subidos",
    label: "Bultos subidos, tareas pendientes",
    explica: "OF con todas sus unidades subidas y alguna operación sin fichar o interrumpida.",
    columnas: COLUMNAS_TAREA,
  },
  {
    id: "desfase",
    label: "Desfase de unidades",
    explica: "OF con unidades subidas que no coinciden con las que hay que fabricar.",
    alcance: "Pedidos AR y delegaciones (SA y BE).",
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
    explica: "OF con fecha dada por Producción, sin bultos subidos y con el pedido sin entregar ni cumplimentar. Por fecha.",
    columnas: [
      { clave: "fechaComprometida", titulo: "Comprometida", tipo: "fecha" },
      { clave: "prioridad", titulo: "Prio.", tipo: "numero" },
      { clave: "of", titulo: "OF", tipo: "of" },
      { clave: "pedido", titulo: "Pedido", tipo: "pedido" },
      { clave: "cliente", titulo: "Cliente", ancho: "max-w-[15rem]" },
      { clave: "articulo", titulo: "Artículo", ancho: "max-w-[22rem]" },
      { clave: "formaEntrega", titulo: "Forma de entrega" },
      { clave: "situacion", titulo: "Situación", tipo: "estado" },
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

// ─── Filtros y orden de una lista ────────────────────────────────────────────
// En el navegador, sobre las filas ya cargadas: buscar texto en cualquier
// columna, filtrar por la PRIMERA columna de fecha de la lista (un día o un
// rango) y ordenar por cualquier columna. Sin orden elegido, el de RPS.

export interface FiltroLista {
  texto: string;
  desde: string;
  hasta: string;
  orden: { clave: string; descendente: boolean } | null;
}

export const FILTRO_LISTA_INICIAL: FiltroLista = { texto: "", desde: "", hasta: "", orden: null };

const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");

/** La columna de fecha por la que se filtra, si la lista tiene alguna. */
export const columnaFecha = (def: DefLista): ColumnaLista | null => def.columnas.find((c) => c.tipo === "fecha") ?? null;

export function filtrarLista(filas: readonly FilaLista[], def: DefLista, f: FiltroLista): FilaLista[] {
  const palabras = sinTildes(f.texto.trim()).split(/\s+/).filter(Boolean);
  const fecha = columnaFecha(def);
  const salida = filas.filter((fila) => {
    if (fecha && (f.desde || f.hasta)) {
      const v = fila[fecha.clave];
      if (typeof v !== "string") return false;
      if (f.desde && v < f.desde) return false;
      if (f.hasta && v > f.hasta) return false;
    }
    if (!palabras.length) return true;
    const todo = sinTildes(def.columnas.map((c) => String(fila[c.clave] ?? "")).join(" "));
    return palabras.every((p) => todo.includes(p));
  });
  const orden = f.orden;
  if (!orden) return salida;
  const col = def.columnas.find((c) => c.clave === orden.clave);
  return salida
    .map((fila, i) => ({ fila, i }))
    .sort((a, b) => {
      const x = a.fila[orden.clave];
      const y = b.fila[orden.clave];
      // Lo vacío siempre al final, se ordene como se ordene.
      if (x == null && y != null) return 1;
      if (y == null && x != null) return -1;
      const r =
        col?.tipo === "numero" && typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x ?? "").localeCompare(String(y ?? ""), "es", { numeric: true, sensitivity: "base" });
      return (orden.descendente ? -r : r) || a.i - b.i;
    })
    .map((x) => x.fila);
}
