import type { NoConformidad } from "./no-conformidad";
import type { SeccionId } from "./secciones";

// ─── Rectificados por revisar ────────────────────────────────────────────────
// Calidad pasa muchos rectificados directamente a fábrica: el pedido nuevo no
// lleva tarea de OT y no aparece en el tablero, pero el planteamiento original
// puede haberse quedado con la medida mala, y el siguiente que lo reutilice
// arrastra el error (Cristina, 02/11/2026; ejemplo: AR.26.05338, que rectifica
// el AR.26.05085).
//
// Lo que los une es la NC: `pedido` el que falló, `rectificativo` el que lo
// arregla. La sección sale de las tareas del pedido ORIGINAL (`tareasDe`), no
// del proceso ni de las causas: el ejemplo no traía ni una cosa ni la otra, y
// el aviso no puede esperar a que Calidad termine de investigar.

/** Desde qué fecha de NC se revisan: el mes en curso cuando se estrenó (Iván,
 *  02/11/2026: «a partir de ahora, si no nos van a salir todos»). */
export const RECTIFICADOS_DESDE = "2026-11-01";

/** Solo quienes tienen planteamiento o archivo que corregir. Impresión imprime
 *  lo que le pasan. */
export const SECCIONES_RECTIFICADOS: readonly SeccionId[] = ["ot", "diseno"];

export function seccionConRectificados(s: unknown): s is SeccionId {
  return SECCIONES_RECTIFICADOS.includes(s as SeccionId);
}

export const RESULTADOS_RECTIFICADO = {
  corregido: "Corregido",
  ya_estaba: "Ya estaba corregido",
  no_hace_falta: "No hace falta",
} as const;

export type ResultadoRectificado = keyof typeof RESULTADOS_RECTIFICADO;

export function esResultadoRectificado(v: unknown): v is ResultadoRectificado {
  return typeof v === "string" && Object.hasOwn(RESULTADOS_RECTIFICADO, v);
}

/** El código de una NC de RPS, como NC010195. */
export const CODIGO_NC_RE = /^NC\d{1,12}$/;

export interface MarcaRectificado {
  resultado: ResultadoRectificado;
  /** Id de la persona que lo marcó. */
  quien: string;
  /** Cómo se llamaba entonces: la fila lo enseña sin cruzar con las personas. */
  nombre: string;
  en: string;
}

export interface Rectificado {
  nc: string;
  fecha: string;
  pedido: string;
  rectificativo: string;
  cliente: string | null;
  /** Qué hay que corregir, con las palabras de Calidad. */
  descripcion: string;
  /** Los defectos con texto: ahí suele venir la medida buena. */
  defectos: string[];
  marca: MarcaRectificado | null;
}

/** Los rectificados de la sección, sin marcar primero y lo más nuevo arriba.
 *  Una NC sin rectificativo no entra: todavía no hay nada que revisar. */
export function rectificadosDeSeccion(
  todas: readonly NoConformidad[],
  seccion: SeccionId,
  marcas: ReadonlyMap<string, MarcaRectificado>,
  clientes: ReadonlyMap<string, string>,
): Rectificado[] {
  const filas: Rectificado[] = [];
  for (const nc of todas) {
    if (!nc.pedido || !nc.rectificativo || nc.fecha < RECTIFICADOS_DESDE) continue;
    if (!nc.tareasDe.includes(seccion)) continue;
    filas.push({
      nc: nc.codigo,
      fecha: nc.fecha,
      pedido: nc.pedido,
      rectificativo: nc.rectificativo,
      cliente: clientes.get(nc.pedido) ?? null,
      descripcion: nc.descripcion,
      defectos: nc.defectos.map((d) => d.descripcion).filter(Boolean),
      marca: marcas.get(nc.codigo) ?? null,
    });
  }
  return filas.sort(
    (a, b) =>
      Number(a.marca !== null) - Number(b.marca !== null) ||
      b.fecha.localeCompare(a.fecha) ||
      b.nc.localeCompare(a.nc),
  );
}

export const pendientesDe = (filas: readonly Rectificado[]): number =>
  filas.filter((f) => !f.marca).length;
