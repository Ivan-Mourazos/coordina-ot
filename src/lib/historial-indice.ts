import { palabrasDe } from "./buscador";
import { PAGE_SIZE, type HistorialFiltros } from "./historial";
import type { SeccionId } from "./secciones";
import { esCodigoPedido } from "./types";

// ─── Filtrar el Historial en memoria ─────────────────────────────────────────
// La lista la construye el servidor (server/historial-indice.ts) y aquí se
// filtra, se ordena y se pagina, con las MISMAS reglas que la consulta SQL de
// siempre (leerHistorialPagina): qué cuenta como cerrado, qué fecha ordena, y
// cómo busca. Va aparte y sin base de datos para poder probarlo.

/** Un pedido tal como sale de la consulta de cierre (PedFin), por sección. */
export interface BaseHistorial {
  pedido: string;
  /** Fechas en milisegundos: 153 000 pedidos en memoria, mejor números que textos. */
  fechaPedido: number | null;
  nOf: number;
  tieneSeccion: boolean;
  pendienteSeccion: boolean;
  pendienteTotal: boolean;
  /** Cierre en RPS (de la sección o, sin tareas de ella, de todo). */
  finalizada: number | null;
}

/** Lo que hace falta de cada pedido para buscar y filtrar por familia. */
export interface InfoPedidoHistorial {
  cliente: string | null;
  negocio: string | null;
  /** Las familias del panel de Sin asignar (familiaDeTexto), una por OF. */
  familias: string[];
  /** Códigos de OF separados por espacios. Un texto y no una lista: con
   *  153 000 pedidos, cada lista de más son megas. */
  ordenes: string;
  /** Cliente y descripciones (de la OF y de la línea), ya normalizados, un
   *  campo por línea ("\n"). */
  textos: string;
}

export interface IndiceHistorial {
  at: number;
  base: Record<SeccionId, BaseHistorial[]>;
  info: Map<string, InfoPedidoHistorial>;
  /** Pedido → CodEmployee del equipo que imputó tiempo en él. */
  personas: Map<string, Set<string>>;
}

/** Sin acentos y en mayúsculas, como compara la base (Latin1_General_CI_AI). */
export const normalizaBusqueda = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** yyyy-mm-dd → medianoche LOCAL, que es como compara SQL Server una fecha sin
 *  hora. `Date.parse` la leería como medianoche UTC. */
function medianoche(iso: string | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso?.trim() ?? "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}

const desc = (a: number | null, b: number | null) => (b ?? -Infinity) - (a ?? -Infinity);

export interface PaginaIndice {
  /** Hasta PAGE_SIZE + 1 filas: la de más dice si hay otra página. */
  filas: BaseHistorial[];
  /** Familias presentes con los demás filtros puestos, de más a menos
   *  pedidos. Como el panel de Sin asignar: solo lo que hay, para que elegir
   *  una no deje la lista en blanco. */
  familias: string[];
  /** Cuántos pedidos tiene cada día de la consulta entera, por clave de día
   *  (yyyy-mm-dd en la zona de la oficina, o "sin-fecha"). */
  porDia: Record<string, number>;
}

/** La clave de día de un instante, en la zona de la oficina. El servidor va en
 *  UTC y el navegador en Europe/Madrid: cortando por UTC, lo cerrado de
 *  madrugada caería en el día anterior y el total no cuadraría con el
 *  separador que se ve. */
const DIA_OFICINA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function claveEnOficina(ms: number): string {
  return DIA_OFICINA.format(new Date(ms));
}

export function filtrarIndice(
  indice: IndiceHistorial,
  f: HistorialFiltros & { seccion: SeccionId },
  /** Cuándo se pasó el pedido en CoordinaOT (ms), si se pasó desde aquí. */
  pasadoDe: (pedido: string) => number | null,
): PaginaIndice {
  const pendientes = new Set(f.pendientes ?? []);
  const q = f.q?.trim() ?? "";
  const palabras = palabrasDe(q);
  const codigo = palabras.join("");
  const exacto = esCodigoPedido(q.toUpperCase()) ? q.toUpperCase() : null;
  const desde = medianoche(f.desde);
  const hasta = medianoche(f.hasta);
  const cliente = f.cliente?.trim() ? normalizaBusqueda(f.cliente.trim()) : null;
  const familia = f.familia?.trim() || null;

  // Por persona: con un id que no es del equipo no hay código, y no sale nada.
  let empleado: string | null = null;
  if (f.operario?.trim()) {
    if (!/^\d+$/.test(f.empleado?.trim() ?? "")) return { filas: [], familias: [], porDia: {} };
    empleado = f.empleado!.trim();
  }

  const coincideTexto = (b: BaseHistorial, info: InfoPedidoHistorial | undefined): boolean => {
    if (exacto) return b.pedido === exacto;
    if (palabras.length === 0) return false;
    if (b.pedido.replaceAll(".", "").includes(codigo)) return true;
    if (!info) return false;
    // El código no lleva espacios, así que no puede casar a caballo entre dos OF.
    if (info.ordenes.includes(codigo)) return true;
    // Todas las palabras en el MISMO campo, como la consulta: "toldo fachada"
    // encuentra "TOLDO DE FACHADA", pero no un cliente "TOLDOS" con una OF de
    // "FACHADA". Primero la prueba barata sobre todo el texto; solo si pasa,
    // campo a campo.
    if (!palabras.every((p) => info.textos.includes(p))) return false;
    return info.textos.split("\n").some((t) => palabras.every((p) => t.includes(p)));
  };

  // Todo menos la familia: de aquí salen las opciones del desplegable.
  const sinFamilia: { b: BaseHistorial; orden: number | null; info: InfoPedidoHistorial | undefined }[] = [];
  for (const b of indice.base[f.seccion]) {
    if (pendientes.has(b.pedido)) continue;
    const pasado = pasadoDe(b.pedido);
    // Cerrado: con tareas de la sección, las suyas terminadas o el pedido pasado
    // desde aquí; sin tareas de la sección, todo lo demás terminado.
    const cerrado = b.tieneSeccion ? !b.pendienteSeccion || pasado !== null : !b.pendienteTotal;
    if (!cerrado) continue;
    const orden = pasado ?? b.finalizada;
    if (desde !== null && (orden === null || orden < desde)) continue;
    if (hasta !== null && (orden === null || orden >= hasta)) continue;
    if (f.soloSeccion && !b.tieneSeccion) continue;
    if (empleado && !indice.personas.get(b.pedido)?.has(empleado)) continue;
    const info = indice.info.get(b.pedido);
    if (cliente && normalizaBusqueda(info?.cliente ?? "") !== cliente) continue;
    if (q && !coincideTexto(b, info)) continue;
    sinFamilia.push({ b, orden, info });
  }

  const cuenta = new Map<string, number>();
  for (const { info } of sinFamilia) for (const fam of info?.familias ?? []) cuenta.set(fam, (cuenta.get(fam) ?? 0) + 1);
  const familias = [...cuenta].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).map(([fam]) => fam);

  const lista = familia ? sinFamilia.filter(({ info }) => info?.familias.includes(familia)) : sinFamilia;
  // Al buscar manda la fecha del pedido; si no, cuándo se pasó (o cerró RPS).
  lista.sort((x, y) =>
    (q ? desc(x.b.fechaPedido, y.b.fechaPedido) : desc(x.orden, y.orden)) || y.b.pedido.localeCompare(x.b.pedido),
  );
  // Cuántos pedidos tiene cada día en la consulta ENTERA, no en esta página.
  // El separador del Historial contaba solo lo cargado y el número crecía
  // según bajabas; aquí ya está la lista completa, así que sale gratis.
  //
  // El día se corta en la zona de la oficina y no en la del servidor, que va
  // en UTC: un pedido cerrado a las 00:30 de Madrid son las 22:30 del día
  // anterior en UTC, y el total caería en un día distinto del que pinta el
  // navegador. Si aun así no coincidieran, el separador no encuentra su clave
  // y vuelve a contar lo cargado (ver `agruparPorDia`).
  const porDia: Record<string, number> = {};
  for (const { orden } of lista) {
    const clave = orden === null ? "sin-fecha" : claveEnOficina(orden);
    porDia[clave] = (porDia[clave] ?? 0) + 1;
  }
  const off = Math.max(0, f.page) * PAGE_SIZE;
  return { filas: lista.slice(off, off + PAGE_SIZE + 1).map(({ b }) => b), familias, porDia };
}
