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
  ordenes: string[];
  /** Cliente y descripciones (de la OF y de la línea), ya normalizados. */
  textos: string[];
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
    if (!/^\d+$/.test(f.empleado?.trim() ?? "")) return { filas: [], familias: [] };
    empleado = f.empleado!.trim();
  }

  const coincideTexto = (b: BaseHistorial, info: InfoPedidoHistorial | undefined): boolean => {
    if (exacto) return b.pedido === exacto;
    if (palabras.length === 0) return false;
    if (b.pedido.replaceAll(".", "").includes(codigo)) return true;
    if (!info) return false;
    if (info.ordenes.some((o) => o.includes(codigo))) return true;
    // Todas las palabras en el MISMO campo, como la consulta: "toldo fachada"
    // encuentra "TOLDO DE FACHADA", pero no un cliente "TOLDOS" con una OF de
    // "FACHADA".
    return info.textos.some((t) => palabras.every((p) => t.includes(p)));
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
  const off = Math.max(0, f.page) * PAGE_SIZE;
  return { filas: lista.slice(off, off + PAGE_SIZE + 1).map(({ b }) => b), familias };
}
