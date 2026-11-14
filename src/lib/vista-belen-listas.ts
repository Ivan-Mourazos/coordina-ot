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
  | "sin-descripcion"
  | "tiempos-previstos"
  | "maquina-a-horas"
  | "tiempos-sin-subir"
  | "delimitacion"
  | "detenidas-material"
  | "compras-pendientes"
  | "tp-cot"
  | "sin-gestionar"
  | "incidencias";

/** Cómo se pinta el valor. `of` y `pedido` van en negrita y monoespaciado;
 *  `fecha` espera ISO (yyyy-mm-dd) y sale dd/mm/aa; `numero` alineado a la
 *  derecha. */
export type TipoColumna = "texto" | "numero" | "fecha" | "of" | "pedido" | "estado";

export interface ColumnaLista {
  clave: string;
  titulo: string;
  tipo?: TipoColumna;
  /** Texto LARGO (cliente, artículo, tarea…): estas columnas se reparten el
   *  ancho que sobra. Sin él, texto corto de ancho fijo. La tabla no tiene
   *  scroll (Iván, 12/11/2026): ver anchoColumna en ListaBelen. */
  largo?: true;
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
  /** Un desplegable para quedarse con un valor de esta columna (p. ej. el
   *  problema: «Sin tiempo» u «8 h o más»). Salen los valores que haya. */
  filtro?: { clave: string; titulo: string };
  /** Qué quiere decir una fila en amarillo, si la lista las tiene. */
  amarillo?: string;
}

/** Una fila. `of` y `pedido` son obligatorios (null si no hay) porque de ellos
 *  depende poder abrir el pedido al pinchar. `clave` la hace única.
 *  `amarilla: 1` la pinta en amarillo (ver DefLista.amarillo). */
export type FilaLista = {
  clave: string;
  of: string | null;
  pedido: string | null;
} & Record<string, string | number | null>;

const COLUMNAS_TAREA: ColumnaLista[] = [
  { clave: "prioridad", titulo: "Prio.", tipo: "numero" },
  { clave: "of", titulo: "OF", tipo: "of" },
  { clave: "pedido", titulo: "Pedido", tipo: "pedido" },
  { clave: "cliente", titulo: "Cliente", largo: true },
  { clave: "tarea", titulo: "Tarea pendiente", largo: true },
  { clave: "maquina", titulo: "Máquina" },
  { clave: "situacion", titulo: "Situación", tipo: "estado" },
  { clave: "fechaSolicitada", titulo: "Solicitada", tipo: "fecha" },
];
/** Las de tiempo previsto: «Horas» con un decimal, para que ordene como
 *  número. Sin la situación de la OF: no cabía a 1366 px y para un tiempo mal
 *  puesto no importa. */
const COLUMNAS_TIEMPO: ColumnaLista[] = [
  { clave: "prioridad", titulo: "Prio.", tipo: "numero" },
  { clave: "of", titulo: "OF", tipo: "of" },
  { clave: "pedido", titulo: "Pedido", tipo: "pedido" },
  { clave: "cliente", titulo: "Cliente", largo: true },
  { clave: "tarea", titulo: "Tarea", largo: true },
  { clave: "maquina", titulo: "Máquina" },
  { clave: "horas", titulo: "Horas", tipo: "numero" },
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
      { clave: "cliente", titulo: "Cliente", largo: true },
      { clave: "articulo", titulo: "Artículo", largo: true },
      { clave: "cantidadOF", titulo: "Unid. OF", tipo: "numero" },
      { clave: "cantidadSubida", titulo: "Subidas", tipo: "numero" },
      { clave: "diferencia", titulo: "Difer.", tipo: "numero" },
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
      { clave: "fechaComprometida", titulo: "F. compro.", tipo: "fecha" },
      { clave: "prioridad", titulo: "Prio.", tipo: "numero" },
      { clave: "of", titulo: "OF", tipo: "of" },
      { clave: "pedido", titulo: "Pedido", tipo: "pedido" },
      { clave: "cliente", titulo: "Cliente", largo: true },
      { clave: "articulo", titulo: "Artículo", largo: true },
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
      { clave: "cliente", titulo: "Cliente", largo: true },
      { clave: "tarea", titulo: "Operación", largo: true },
      { clave: "maquinas", titulo: "Máquinas", largo: true },
    ],
  },
  {
    id: "sin-descripcion",
    label: "OF sin descripción",
    explica: "OF abiertas cuya descripción falta o solo contiene espacios.",
    columnas: [
      { clave: "of", titulo: "OF", tipo: "of" },
      { clave: "pedido", titulo: "Pedido", tipo: "pedido" },
      { clave: "cliente", titulo: "Cliente", largo: true },
      { clave: "cantidad", titulo: "Unidades", tipo: "numero" },
      { clave: "fechaInicio", titulo: "F. inicio prevista", tipo: "fecha" },
      { clave: "referencia", titulo: "Referencia", largo: true },
    ],
  },

  // ── Belén, 12/11/2026: ocho más, casi todas hojas de sus Excels
  // («comprobaciones_planificador» y «carga_por_maquina_datos_planificador»).
  {
    // Sus hojas «Tareas tiempo 0» y «Tareas 8 horas», juntas: es el mismo
    // fallo (el tiempo previsto de la tarea mal puesto) y se separa con el
    // desplegable «Problema».
    id: "tiempos-previstos",
    label: "Tiempo previsto 0 u 8 h o más",
    explica: "Operaciones por hacer con el tiempo previsto a cero o de 8 horas o más.",
    filtro: { clave: "problema", titulo: "Problema" },
    columnas: [{ clave: "problema", titulo: "Problema" }, ...COLUMNAS_TIEMPO],
  },
  {
    id: "maquina-a-horas",
    label: "Máquina A en horas",
    explica: "Operaciones por hacer en máquinas de Arzúa (A-… y grupos …-A) con el tiempo previsto en horas en vez de en minutos.",
    columnas: COLUMNAS_TIEMPO,
  },
  {
    // Su hoja «Tiempos sin subir OF detenidas»: fichajes que OLANET mandó y
    // RPS tiene aparcados (CPRImputationOnLine) porque la OF no admite
    // imputaciones mientras está detenida.
    id: "tiempos-sin-subir",
    label: "Detenidas con tiempos sin subir",
    explica: "OF detenidas con fichajes de OLANET que no han pasado a RPS: mientras siga detenida, no suben.",
    columnas: [
      { clave: "prioridad", titulo: "Prio.", tipo: "numero" },
      { clave: "of", titulo: "OF", tipo: "of" },
      { clave: "pedido", titulo: "Pedido", tipo: "pedido" },
      { clave: "cliente", titulo: "Cliente", largo: true },
      { clave: "articulo", titulo: "Artículo", largo: true },
      { clave: "fichajes", titulo: "Fichajes", tipo: "numero" },
      { clave: "desde", titulo: "Desde", tipo: "fecha" },
      { clave: "hasta", titulo: "Hasta", tipo: "fecha" },
      { clave: "fechaSolicitada", titulo: "Solicitada", tipo: "fecha" },
    ],
  },
  {
    // Sus hojas «Fecha delimitación incorrecta» y «Fecha delimita<>fecha
    // planific», juntas y separadas por el desplegable «Problema».
    id: "delimitacion",
    label: "Fecha de delimitación incorrecta",
    explica: "Operaciones por hacer con la delimitación ya pasada, después de la fecha de fabricación, o (si es «empezar el») en otro día que el planificado.",
    filtro: { clave: "problema", titulo: "Problema" },
    columnas: [
      { clave: "problema", titulo: "Problema" },
      { clave: "fechaDelimitacion", titulo: "Delimitación", tipo: "fecha" },
      { clave: "fechaFabricacion", titulo: "Fabricación", tipo: "fecha" },
      { clave: "fechaPlanificada", titulo: "Planificada", tipo: "fecha" },
      { clave: "prioridad", titulo: "Prio.", tipo: "numero" },
      { clave: "of", titulo: "OF", tipo: "of" },
      { clave: "pedido", titulo: "Pedido", tipo: "pedido" },
      { clave: "cliente", titulo: "Cliente", largo: true },
      { clave: "tarea", titulo: "Tarea", largo: true },
      { clave: "maquina", titulo: "Máquina" },
      { clave: "situacion", titulo: "Situación", tipo: "estado" },
    ],
  },
  {
    // Su hoja «OF detenidas material recibido».
    id: "detenidas-material",
    label: "Detenidas con material recibido",
    explica: "OF detenidas con todo lo de compras ya recibido: revisarlas para activarlas. Sin las que tienen TP o COT, que se detienen por la visita.",
    columnas: [
      { clave: "prioridad", titulo: "Prio.", tipo: "numero" },
      { clave: "of", titulo: "OF", tipo: "of" },
      { clave: "pedido", titulo: "Pedido", tipo: "pedido" },
      { clave: "cliente", titulo: "Cliente", largo: true },
      { clave: "articulo", titulo: "Artículo", largo: true },
      { clave: "lineas", titulo: "Compras", tipo: "numero" },
      { clave: "fechaSolicitada", titulo: "Solicitada", tipo: "fecha" },
    ],
  },
  {
    id: "compras-pendientes",
    label: "Compras pendientes",
    explica: "OF sin finalizar, de pedidos sin entregar, con material de compras por recibir. Por fecha solicitada y, el mismo día, por prioridad.",
    columnas: [
      { clave: "fechaSolicitada", titulo: "Solicitada", tipo: "fecha" },
      { clave: "prioridad", titulo: "Prio.", tipo: "numero" },
      { clave: "of", titulo: "OF", tipo: "of" },
      { clave: "pedido", titulo: "Pedido", tipo: "pedido" },
      { clave: "cliente", titulo: "Cliente", largo: true },
      { clave: "articulo", titulo: "Artículo", largo: true },
      { clave: "lineas", titulo: "Faltan", tipo: "numero" },
      { clave: "llega", titulo: "Llega", tipo: "fecha" },
      { clave: "situacion", titulo: "Situación", tipo: "estado" },
    ],
  },
  {
    id: "tp-cot",
    label: "TP o COT sin rematar",
    explica: "OF con TP o COT que no están acabadas del todo (la visita, alguna tarea o los bultos), de pedidos sin entregar. Por fecha solicitada.",
    amarillo: "En amarillo, las que ya tienen hechos sus TP y COT.",
    filtro: { clave: "visitas", titulo: "TP y COT" },
    columnas: [
      { clave: "fechaSolicitada", titulo: "Solicitada", tipo: "fecha" },
      { clave: "prioridad", titulo: "Prio.", tipo: "numero" },
      { clave: "of", titulo: "OF", tipo: "of" },
      { clave: "pedido", titulo: "Pedido", tipo: "pedido" },
      { clave: "cliente", titulo: "Cliente", largo: true },
      { clave: "articulo", titulo: "Artículo", largo: true },
      { clave: "visitas", titulo: "TP y COT", largo: true },
      // Lo que falta además de la visita, en una columna: con dos no cabía a
      // 1366 px junto a la columna de listas.
      { clave: "falta", titulo: "Falta", largo: true },
      { clave: "situacion", titulo: "Situación", tipo: "estado" },
    ],
  },
  {
    // Su Excel «pedidos_sin_of» (12/11/2026): una fila por línea. «De
    // fabricar» = el artículo tiene escandallo (CPRStructure): de las líneas
    // AR.26 desde septiembre, 1.604 de las 1.632 con OF lo tenían.
    id: "sin-gestionar",
    label: "Pedidos sin gestionar",
    explica: "Líneas de fabricar de pedidos de los últimos 60 días, sin entregar, que todavía no tienen OF. Sin pedidos de almacén ni reparaciones in situ.",
    columnas: [
      { clave: "fechaSolicitada", titulo: "Solicitada", tipo: "fecha" },
      { clave: "prioridad", titulo: "Prio.", tipo: "numero" },
      { clave: "pedido", titulo: "Pedido", tipo: "pedido" },
      { clave: "linea", titulo: "Lín.", tipo: "numero" },
      { clave: "cliente", titulo: "Cliente", largo: true },
      { clave: "articulo", titulo: "Artículo", largo: true },
      { clave: "formaEntrega", titulo: "Entrega", largo: true },
      { clave: "rotulacion", titulo: "Rotulación", largo: true },
      { clave: "sinCargo", titulo: "Sin cargo", largo: true },
    ],
  },
  {
    // Belén, 14/11/2026: lo que miraba en RPS en «Fabricación > Imputación de
    // tiempos» con el filtro de improductivo, buscando por OF. Una fila por
    // fichaje improductivo de una persona (los de máquina repiten lo mismo
    // sin empleado), del último año y de cualquier serie.
    id: "incidencias",
    label: "Incidencias",
    explica: "Fichajes improductivos del último año, con su causa. Escribe la OF en el buscador para ver los suyos.",
    alcance: "Todas las series.",
    filtro: { clave: "causa", titulo: "Causa" },
    columnas: [
      { clave: "dia", titulo: "Día", tipo: "fecha" },
      { clave: "of", titulo: "OF", tipo: "of" },
      { clave: "pedido", titulo: "Pedido", tipo: "pedido" },
      { clave: "empleado", titulo: "Empleado", largo: true },
      { clave: "inicio", titulo: "Inicio" },
      { clave: "fin", titulo: "Fin" },
      { clave: "tarea", titulo: "Tarea", largo: true },
      { clave: "improductivo", titulo: "Improd." },
      { clave: "causa", titulo: "Causa", largo: true },
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
  /** El valor elegido en el desplegable de la lista (DefLista.filtro); "" = todos. */
  valor: string;
  orden: { clave: string; descendente: boolean } | null;
}

export const FILTRO_LISTA_INICIAL: FiltroLista = { texto: "", desde: "", hasta: "", valor: "", orden: null };

/** Los valores que hay en la columna del desplegable, sin repetir y en orden. */
export function valoresFiltro(filas: readonly FilaLista[], def: DefLista): string[] {
  const clave = def.filtro?.clave;
  if (!clave) return [];
  return [...new Set(filas.map((f) => f[clave]).filter((v): v is string | number => v !== null && v !== "").map(String))]
    .sort((a, b) => a.localeCompare(b, "es"));
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");

/** La columna de fecha por la que se filtra, si la lista tiene alguna. */
export const columnaFecha = (def: DefLista): ColumnaLista | null => def.columnas.find((c) => c.tipo === "fecha") ?? null;

export function filtrarLista(filas: readonly FilaLista[], def: DefLista, f: FiltroLista): FilaLista[] {
  const palabras = sinTildes(f.texto.trim()).split(/\s+/).filter(Boolean);
  const fecha = columnaFecha(def);
  const salida = filas.filter((fila) => {
    if (def.filtro && f.valor && String(fila[def.filtro.clave] ?? "") !== f.valor) return false;
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
