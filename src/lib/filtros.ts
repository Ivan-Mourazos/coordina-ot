import type { EstadoOF, Familia, OF, Pedido, Prioridad } from "./types";
import { estaAtrasado } from "./types";
import { ofOcultaDeOT } from "./fases-tablero";

// ─── Filtrado de la barra: lógica pura, sin React ────────────────────────────
// Vivía dentro de Board.tsx, repartida entre `pasaFiltros` y `listaOrdenados`,
// y por eso no tenía ni un test: para probar "el filtro de familia recorta las
// OF" había que montar el tablero entero. Aquí es una función de pedidos a
// pedidos y se puede probar con un array.
//
// Regla de toda la barra: **los filtros ESTRECHAN el pedido, no lo aceptan o
// rechazan entero**. Filtrar por familia TOLDO en un pedido con un toldo y una
// lona enseña el pedido con su OF de toldo, no las dos. Antes familia y estado
// eran `p.ofs.some(...)`: el pedido pasaba entero y salías creyendo que sus
// cuatro OF eran de la familia que habías pedido.

/** Categorías de trabajo que NO son el trabajo normal de OT.
 *
 *  Se eligen de una en una y en EXCLUSIVA: "normal" es todo lo demás, y elegir
 *  una categoría enseña SOLO esa. Antes eran cuatro interruptores sueltos que
 *  se podían cruzar; nadie cruzaba dos, y a cambio gastaban una fila entera de
 *  la barra para decir "esta categoría está escondida". */
export const CATEGORIAS = ["normal", "taller", "detenidas", "anuladas", "internos"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const CATEGORIA_LABEL: Record<Categoria, string> = {
  normal: "Trabajo de OT",
  taller: "Para taller",
  detenidas: "OF detenidas",
  anuladas: "OF anuladas",
  internos: "Pedidos internos",
};

export const CATEGORIA_AYUDA: Record<Categoria, string> = {
  normal: "El trabajo normal de Oficina Técnica: sin las de taller, detenidas, anuladas ni los pedidos internos.",
  taller: "SOLO las OF que entran por una tarea de taller (capotas, faldones) y no ha rescatado nadie. No son trabajo de OT.",
  detenidas: "SOLO las OF que Producción tiene detenidas. No se pueden fichar y desatascarlas no es cosa de OT.",
  anuladas: "SOLO las OF anuladas: las que OT decidió no hacer (las acaba el taller). Es el sitio para consultarlas y, si hace falta, restaurarlas.",
  internos: "SOLO el trabajo interno: sin pedido de venta o a nombre de la propia empresa.",
};

/** Por qué se ordena la Lista.
 *
 *  Vuelve a la barra tras un rodeo por las cabeceras de la tabla. Ordenar
 *  pulsando la columna suena bien y en una tabla normal lo es, pero aquí tres
 *  de las columnas son celdas fundidas —identidad, estado— y hacía falta meter
 *  dos rótulos pulsables dentro de cada una, con su flecha y su hueco: la
 *  cabecera acababa contando más de lo que cuenta una fila. En la barra, junto
 *  a los filtros, es un ajuste más de la vista y se lee de corrido. */
export const ORDENES = ["planificacion", "codigo", "cliente", "autor", "fase"] as const;
export type OrdenLista = (typeof ORDENES)[number];

export const ORDEN_LABEL: Record<OrdenLista, string> = {
  planificacion: "Fecha planificada",
  codigo: "Nº de pedido",
  cliente: "Cliente",
  autor: "Quién lo lleva",
  fase: "Por dónde va",
};

/** Valor de autor/revisor: id de operario, "todos" o "sin" (sin asignar). */
export type FiltroPersona = string;
export const SIN_ASIGNAR = "sin";

export interface Filtros {
  query: string;
  familia: Familia | "todas";
  estado: EstadoOF | "todos";
  prioridad: Prioridad | "todas";
  /** id de operario · "todos" · "sin" (sin asignar). */
  autor: FiltroPersona;
  revisor: FiltroPersona;
  /** Ventana sobre la fecha de planificación, ISO yyyy-mm-dd. "" = sin límite. */
  desde: string;
  hasta: string;
  soloAtrasados: boolean;
  /** Solo las OF que esperan material de compras. No impide plantear —se puede
   *  seguir trabajando—, pero saber cuáles esperan algo cambia el orden del
   *  día, así que es una consulta, no un aviso. */
  soloMaterialPendiente: boolean;
  categoria: Categoria;
  /** Por qué se ordena la Lista, y en qué sentido. Solo lo usa esa vista; las
   *  otras dos tienen su propio reparto (por zonas, por estado de revisión) y
   *  lo ignoran. Vive aquí, y no aparte, para que viaje en la URL con el resto
   *  y un enlace enseñe la lista tal cual la dejaste. */
  orden: OrdenLista;
  ordenDesc: boolean;
}

/** Todo apagado: la barra en reposo. */
export const FILTROS_VACIOS: Filtros = {
  query: "",
  familia: "todas",
  estado: "todos",
  prioridad: "todas",
  autor: "todos",
  revisor: "todos",
  desde: "",
  hasta: "",
  soloAtrasados: false,
  soloMaterialPendiente: false,
  categoria: "normal",
  // La planificada ascendente, que es como ha vivido siempre esta lista: la
  // fecha por la que Producción reparte el trabajo, así que de arriba abajo se
  // lee "lo que toca antes".
  orden: "planificacion",
  ordenDesc: false,
};

export const FILTROS_INICIALES: Filtros = FILTROS_VACIOS;

/** ¿Esta OF cae en la categoría pedida?
 *
 *  Las categorías se solapan a propósito (una anulada puede estar además
 *  detenida): cada una responde "¿es de esta clase?", no "¿es SOLO de esta
 *  clase?". La única exclusiva es `normal`, que es no ser de ninguna. */
export function ofEnCategoria(of: OF, interno: boolean, c: Categoria): boolean {
  switch (c) {
    case "taller":
      return ofOcultaDeOT(of);
    case "detenidas":
      return of.detenida === true;
    case "anuladas":
      return of.estado === "anulada";
    case "internos":
      return interno;
    case "normal":
      return (
        !ofOcultaDeOT(of) &&
        of.detenida !== true &&
        of.estado !== "anulada" &&
        !interno
      );
  }
}

/** Cuántas OF hay de cada categoría, sin mirar más filtros.
 *
 *  Un número al lado de cada opción evita el paseo a ciegas: antes había que
 *  pulsar "OF anuladas" para descubrir que no había ninguna. */
export function contarCategorias(pedidos: Pedido[]): Record<Categoria, number> {
  const cuenta = { normal: 0, taller: 0, detenidas: 0, anuladas: 0, internos: 0 };
  for (const p of pedidos)
    for (const of of p.ofs)
      for (const c of CATEGORIAS)
        if (ofEnCategoria(of, p.interno === true, c)) cuenta[c]++;
  return cuenta;
}

/** Lo mismo, pero contando lo que se vería DE VERDAD al elegir cada categoría:
 *  con el resto de la barra puesta. Un contador que no cuadra con lo que sale
 *  al pulsar es peor que no poner ninguno — dirías "hay 12 detenidas", pulsas
 *  y ves tres porque seguías filtrando por cliente. */
export function contarCategoriasVisibles(
  pedidos: Pedido[],
  f: Filtros,
  hoy: string,
): Record<Categoria, number> {
  const cuenta = { normal: 0, taller: 0, detenidas: 0, anuladas: 0, internos: 0 };
  for (const c of CATEGORIAS)
    cuenta[c] = aplicarFiltros(pedidos, { ...f, categoria: c }, hoy).reduce(
      (n, p) => n + p.ofs.length,
      0,
    );
  return cuenta;
}

/** Lo que se puede elegir en cada desplegable, según lo que HAY delante.
 *
 *  Cada lista se calcula con su propio filtro apagado y el resto puesto, igual
 *  que los contadores de categoría: así "Familia" ofrece las familias que
 *  quedarían al elegirlas —si estás en "Ver: Para taller", las de esos partes—
 *  pero elegir una no vacía su propio desplegable.
 *
 *  Ofrecer el catálogo entero llenaba los menús de opciones que dejaban la
 *  pantalla en blanco: siete familias cuando en el tablero solo hay tres, o
 *  "Aprobada" en una lista donde no queda ninguna. */
export interface OpcionesFiltro {
  familias: Familia[];
  estados: EstadoOF[];
  prioridades: Prioridad[];
}

export function opcionesDisponibles(
  pedidos: Pedido[],
  f: Filtros,
  hoy: string,
): OpcionesFiltro {
  const ofsDe = (sin: Partial<Filtros>) =>
    aplicarFiltros(pedidos, { ...f, ...sin }, hoy);

  const familias = new Set<Familia>();
  for (const p of ofsDe({ familia: "todas" })) for (const o of p.ofs) familias.add(o.familia);

  const estados = new Set<EstadoOF>();
  for (const p of ofsDe({ estado: "todos" })) for (const o of p.ofs) estados.add(o.estado);

  const prioridades = new Set<Prioridad>();
  for (const p of ofsDe({ prioridad: "todas" })) prioridades.add(p.prioridad);

  return {
    familias: [...familias].sort(),
    estados: [...estados],
    prioridades: [...prioridades].sort((a, b) => b - a),
  };
}

/** ¿Coincide el valor de un filtro de persona con la OF? */
function pasaPersona(valor: FiltroPersona, id: string | null): boolean {
  if (valor === "todos") return true;
  if (valor === SIN_ASIGNAR) return id === null;
  return id === valor;
}

/** Condiciones que miran el PEDIDO entero: o pasa con todas sus OF o no pasa. */
function pasaPedido(p: Pedido, f: Filtros, hoy: string): boolean {
  // El buscador es también el filtro de cliente: el desplegable que había
  // obligaba a encontrar el nombre exacto entre cientos ("MAHOU S.A." frente a
  // "MAHOU"), y escribir cuatro letras aquí hace lo mismo y más rápido.
  const q = f.query.trim().toLowerCase();
  if (q && !`${p.codigo} ${p.cliente} ${p.negocio ?? ""}`.toLowerCase().includes(q)) return false;
  if (f.prioridad !== "todas" && p.prioridad !== f.prioridad) return false;
  // Los ya pasados a Producción nunca: esto es la lista de lo que queda por
  // hacer. Hubo un interruptor para enseñarlos y no se entendía qué prometía —
  // "pasados" a secas no dice pasados a dónde—, así que se fue con él.
  if (p.situacion === "completado") return false;
  // La ventana va sobre la planificación, que es la fecha por la que se ordena
  // el trabajo de OT (ver el comentario de `fechaPlanificacion` en types.ts).
  // `hasta` es inclusivo: quien escribe "hasta el 31" espera ver el día 31.
  if (f.desde && p.fechaPlanificacion < f.desde) return false;
  if (f.hasta && p.fechaPlanificacion > f.hasta) return false;
  if (f.soloAtrasados && !estaAtrasado(p, hoy)) return false;
  return true;
}

/** Condiciones que miran cada OF: recortan el pedido en vez de descartarlo. */
function pasaOF(of: OF, interno: boolean, f: Filtros): boolean {
  if (!ofEnCategoria(of, interno, f.categoria)) return false;
  if (f.familia !== "todas" && of.familia !== f.familia) return false;
  if (f.estado !== "todos" && of.estado !== f.estado) return false;
  if (!pasaPersona(f.autor, of.autorId)) return false;
  if (!pasaPersona(f.revisor, of.revisorId)) return false;
  if (f.soloMaterialPendiente && !of.materialPendienteHasta) return false;
  return true;
}

/** Aplica la barra entera. Devuelve los pedidos con sus OF ya recortadas; los
 *  que se quedan sin ninguna desaparecen. */
export function aplicarFiltros(pedidos: Pedido[], f: Filtros, hoy: string): Pedido[] {
  const salida: Pedido[] = [];
  for (const p of pedidos) {
    if (!pasaPedido(p, f, hoy)) continue;
    const interno = p.interno === true;
    const ofs = p.ofs.filter((of) => pasaOF(of, interno, f));
    if (ofs.length === 0) continue;
    // Sin recorte se devuelve el MISMO objeto: los `useMemo` de abajo comparan
    // por identidad y así un filtro que no filtra nada no repinta el tablero.
    salida.push(ofs.length === p.ofs.length ? p : { ...p, ofs });
  }
  return salida;
}

/** Etiquetas de lo que está recortando ahora mismo, para el botón de limpiar y
 *  para poder decirle a la vista vacía que la culpa es de los filtros. */
export function filtrosActivos(f: Filtros): string[] {
  const chips: string[] = [];
  if (f.query.trim()) chips.push(`"${f.query.trim()}"`);
  if (f.familia !== "todas") chips.push(f.familia);
  if (f.estado !== "todos") chips.push(f.estado);
  if (f.prioridad !== "todas") chips.push(`prioridad ${f.prioridad}`);
  if (f.autor !== "todos") chips.push("autor");
  if (f.revisor !== "todos") chips.push("revisor");
  if (f.desde || f.hasta) chips.push("fechas");
  if (f.soloAtrasados) chips.push("solo atrasados");
  if (f.soloMaterialPendiente) chips.push("esperando material");
  // "normal" no cuenta: es el estado de reposo de la barra, no un recorte que
  // alguien haya pedido. Pero sí cuenta para explicar una lista vacía, y por
  // eso `hayRecorte` lo mira aparte.
  if (f.categoria !== "normal") chips.push(CATEGORIA_LABEL[f.categoria]);
  return chips;
}

export const hayFiltrosActivos = (f: Filtros): boolean => filtrosActivos(f).length > 0;

// ─── Ida y vuelta a la URL ───────────────────────────────────────────────────
// Para que los filtros sobrevivan a una recarga y se pueda pasar un enlace
// ("mira los de MAHOU que van tarde") en vez de dictar por dónde hay que
// pulsar. Solo se escribe lo que está activo: la URL de la vista limpia queda
// limpia.

const CLAVES: Array<[keyof Filtros, string]> = [
  ["query", "q"],
  ["familia", "fam"],
  ["estado", "est"],
  ["prioridad", "pri"],
  ["autor", "aut"],
  ["revisor", "rev"],
  ["desde", "desde"],
  ["hasta", "hasta"],
  ["categoria", "ver"],
  ["orden", "ord"],
];

export function filtrosAParams(f: Filtros): URLSearchParams {
  const sp = new URLSearchParams();
  const neutro: Record<string, unknown> = { ...FILTROS_INICIALES };
  for (const [clave, corta] of CLAVES) {
    const v = f[clave];
    if (v !== neutro[clave] && v !== "") sp.set(corta, String(v));
  }
  if (f.soloAtrasados) sp.set("atr", "1");
  if (f.soloMaterialPendiente) sp.set("mat", "1");
  if (f.ordenDesc) sp.set("desc", "1");
  return sp;
}

/** Lee de la URL lo que reconoce y descarta lo demás. Nunca lanza: una URL
 *  editada a mano o de una versión vieja tiene que dejar la app usable, no
 *  romperla — por eso todo valor desconocido cae al de por defecto. */
export function paramsAFiltros(sp: URLSearchParams): Filtros {
  const f: Filtros = { ...FILTROS_INICIALES };
  const texto = (k: string) => sp.get(k) ?? "";
  if (texto("q")) f.query = texto("q");
  if (texto("fam")) f.familia = texto("fam") as Familia;
  if (texto("est")) f.estado = texto("est") as EstadoOF;
  const pri = Number(texto("pri"));
  if (pri === 1 || pri === 2 || pri === 3) f.prioridad = pri;
  if (texto("aut")) f.autor = texto("aut");
  if (texto("rev")) f.revisor = texto("rev");
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto("desde"))) f.desde = texto("desde");
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto("hasta"))) f.hasta = texto("hasta");
  const ver = texto("ver");
  if ((CATEGORIAS as readonly string[]).includes(ver)) f.categoria = ver as Categoria;
  f.soloAtrasados = sp.get("atr") === "1";
  f.soloMaterialPendiente = sp.get("mat") === "1";
  const ord = texto("ord");
  if ((ORDENES as readonly string[]).includes(ord)) f.orden = ord as OrdenLista;
  f.ordenDesc = sp.get("desc") === "1";
  return f;
}
