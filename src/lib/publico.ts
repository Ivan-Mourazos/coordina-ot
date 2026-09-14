import { palabrasDe } from "./buscador";
import { normalizaBusqueda, type BaseHistorial, type IndiceHistorial } from "./historial-indice";
import { SECCION_POR_DEFECTO } from "./secciones";
import { esCodigoPedido } from "./types";

// ─── Lo que ve quien no tiene sesión ─────────────────────────────────────────
// Toda la casa pregunta lo mismo —"¿por dónde va este pedido?"— y hasta ahora
// lo preguntaba por teléfono. Aquí se decide qué es estar pendiente, en qué
// orden se enseña y cómo se cuenta. Sin base de datos, para poder probarlo.
//
// NO ENTRA NADA INTERNO. Ni notas, ni causas, ni marcas de revisión: eso se
// escribe entre nosotros y se escribe distinto si lo lee toda la casa.

export const PAGE_PUBLICO = 40;

export type ListaPublica = "pendientes" | "realizados";

export interface FiltrosPublicos {
  lista: ListaPublica;
  page: number;
  q?: string;
  cliente?: string;
  familia?: string;
  /** ISO yyyy-mm-dd, inclusive. Sobre la entrega en pendientes y sobre el
   *  cierre en realizados: en cada lista, la fecha que se está mirando. */
  desde?: string;
  hasta?: string;
}

export interface PedidoPublico {
  codigo: string;
  cliente: string | null;
  negocio: string | null;
  /** ISO yyyy-mm-dd. */
  fechaPedido: string | null;
  fechaEntrega: string | null;
  fechaFinalizacion: string | null;
  nOf: number;
  pendiente: boolean;
  pendienteEntrega: boolean;
  /** Centros de trabajo con tarea sin cerrar, por su descripción. */
  centros: string[];
  /** La frase que se lee en la fila (ver `frasePublica`). */
  estado: string;
}

/** Un pedido sigue vivo mientras le quede una tarea abierta O algo por
 *  entregar. Lo segundo no es un extra: terminar en fábrica no es entregar, y
 *  el almacén es la etapa por la que más llaman. */
export function estaPendiente(b: BaseHistorial): boolean {
  return b.pendienteTotal || b.pendienteEntrega;
}

/** "CORTE AUTOMÁTICO PARQUE EMPRESARIAL" → "Corte automático parque empresarial".
 *  RPS los guarda a gritos; en una fila de lista eso no se lee. */
function enFrase(centro: string): string {
  const limpio = centro.trim().toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/** Por dónde va el pedido, con la entrega de último tramo. */
export function frasePublica(centros: readonly string[], pendienteEntrega: boolean): string {
  if (centros.length > 0) return `Pendiente de: ${centros.map(enFrase).join(", ")}`;
  return pendienteEntrega ? "Fabricado, pendiente de entregar" : "Entregado";
}

/** yyyy-mm-dd → medianoche LOCAL, como compara SQL Server una fecha sin hora.
 *  `dias` desplaza el día (se usa para llegar a la medianoche del día
 *  SIGUIENTE); se lo pasamos al constructor de Date en vez de sumar ms a
 *  mano para que el cambio de hora (DST) lo resuelva el propio Date. */
function medianoche(iso: string | undefined, dias = 0): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso?.trim() ?? "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dias).getTime() : null;
}

/** Lo que entrega antes, primero. Sin fecha, al final: un pedido sin entrega
 *  puesta no es urgente, es un pedido del que no se sabe. El desempate usa
 *  localeCompare (como el gemelo de historial-indice.ts) y no `<`: con `<` el
 *  resultado es 1 en los dos sentidos cuando los códigos son iguales, lo que
 *  rompe la simetría que un comparador tiene que cumplir. */
const porEntrega = (a: BaseHistorial, b: BaseHistorial): number =>
  (a.fechaEntrega ?? Infinity) - (b.fechaEntrega ?? Infinity) || a.pedido.localeCompare(b.pedido, "es");

const porCierre = (a: BaseHistorial, b: BaseHistorial): number =>
  (b.finalizada ?? -Infinity) - (a.finalizada ?? -Infinity) || a.pedido.localeCompare(b.pedido, "es");

export function filtrarPublico(
  indice: IndiceHistorial,
  f: FiltrosPublicos,
): { filas: BaseHistorial[]; hasMore: boolean } {
  const pendientes = f.lista === "pendientes";
  const q = f.q?.trim() ?? "";
  const palabras = palabrasDe(q);
  const codigo = palabras.join("");
  const exacto = esCodigoPedido(q.toUpperCase()) ? q.toUpperCase() : null;
  const cliente = f.cliente?.trim() ? normalizaBusqueda(f.cliente.trim()) : null;
  const familia = f.familia?.trim() || null;
  const desde = medianoche(f.desde);
  // "hasta" es inclusive (ver FiltrosPublicos): un pedido cerrado a mitad de
  // tarde de ESE día tiene que salir. Comparar con la medianoche del propio
  // día lo dejaba fuera en cuanto llevaba hora real (como `finalizada`), así
  // que el límite es la medianoche del día SIGUIENTE, con `<` estricto.
  const hasta = medianoche(f.hasta, 1);

  const elegidas: BaseHistorial[] = [];
  // Las dos secciones del índice llevan los MISMOS pedidos de la casa (lo que
  // cambia entre ellas es de qué tareas se mira el cierre), así que aquí se
  // recorre una sola: contarlas las dos duplicaría cada pedido.
  for (const b of indice.base[SECCION_POR_DEFECTO]) {
    if (estaPendiente(b) !== pendientes) continue;

    const fecha = pendientes ? b.fechaEntrega : b.finalizada;
    if (desde !== null && (fecha === null || fecha < desde)) continue;
    if (hasta !== null && (fecha === null || fecha >= hasta)) continue;

    const info = indice.info.get(b.pedido);
    // A propósito distinto del gemelo filtrarIndice (historial-indice.ts), que
    // compara con `!==`: ahí el equipo elige el cliente de un desplegable, aquí
    // el invitado escribe de memoria un trozo del nombre, así que hace falta
    // coincidencia parcial.
    if (cliente && !normalizaBusqueda(info?.cliente ?? "").includes(cliente)) continue;
    if (familia && !(info?.familias ?? []).includes(familia)) continue;

    if (q) {
      if (exacto) {
        if (b.pedido !== exacto) continue;
      } else if (palabras.length === 0) {
        continue;
      } else if (
        !b.pedido.replaceAll(".", "").includes(codigo) &&
        !(info?.ordenes ?? "").includes(codigo) &&
        !palabras.every((p) => (info?.textos ?? "").includes(p))
      ) {
        continue;
      }
    }
    elegidas.push(b);
  }

  elegidas.sort(pendientes ? porEntrega : porCierre);
  const off = Math.max(0, f.page) * PAGE_PUBLICO;
  const trozo = elegidas.slice(off, off + PAGE_PUBLICO + 1);
  return { filas: trozo.slice(0, PAGE_PUBLICO), hasMore: trozo.length > PAGE_PUBLICO };
}

/** Los filtros tal como llegan de la URL. NUNCA lanza: esto viene de fuera y
 *  un valor raro no puede tumbar la página de nadie. */
export function normalizarFiltrosPublicos(sp: URLSearchParams): FiltrosPublicos {
  const page = Number(sp.get("page"));
  const texto = (k: string): string | undefined => sp.get(k)?.trim() || undefined;
  return {
    lista: sp.get("lista") === "realizados" ? "realizados" : "pendientes",
    page: Number.isInteger(page) && page >= 0 ? page : 0,
    q: texto("q"),
    cliente: texto("cliente"),
    familia: texto("familia"),
    desde: texto("desde"),
    hasta: texto("hasta"),
  };
}
