// ─── Qué hacer cuando se despliega con una pestaña abierta ───────────────────
// La parte que se puede probar sin navegador; el resto está en
// `components/VersionNueva.tsx`.
//
// Iván (25/11/2026): el aviso de «versión nueva» salía en cada despliegue,
// fuera un arreglo de rendimiento o una función nueva, y un aviso que sale
// siempre se deja de leer. Ahora la pestaña se pone al día SOLA en cuanto
// está quieta, y el aviso solo sale si la versión nueva trae novedades
// (las líneas `Novedad:` de los commits) que le tocan a quien mira.

import { cambiosSinLeer, leAfecta, type Cambio, type Novedad, type PerfilNovedades } from "./novedades";

/** Los cambios publicados después de `desde` (la marca `id·n` de la última
 *  novedad que traía el código de la pestaña), para todos los apartados: el
 *  filtro por persona lo hace el navegador, que es quien sabe quién mira.
 *  Sin marca o con una que el servidor no conoce, nada: mejor callar que
 *  avisar de todo el historial. */
export function cambiosDesde(desde: string | null, entradas?: readonly Novedad[]): Cambio[] {
  if (!desde) return [];
  return [...cambiosSinLeer(desde, entradas, "direccion")];
}

/** Los que merecen aviso para esta persona: los suyos y los de todos. */
export function cambiosParaAvisar(cambios: readonly Cambio[], perfil: PerfilNovedades): Cambio[] {
  return cambios.filter((c) => leAfecta(c, perfil));
}

/** Tiempo sin tocar la pestaña para recargarla por su cuenta. Lo bastante
 *  largo para que no pase entre dos clics de alguien que está trabajando. */
export const QUIETA_MS = 3 * 60_000;

export interface EstadoPestana {
  /** Desde el último ratón, tecla o rueda. */
  inactivaMs: number;
  /** Algún cuadro, ficha o panel abierto. */
  hayVentana: boolean;
  /** El cursor está en un campo. */
  escribiendo: boolean;
  /** Hay texto escrito en algún área de texto (una nota a medias). */
  hayBorrador: boolean;
}

/** Recargar sola solo cuando no se pierde nada: nadie la está tocando, no hay
 *  nada abierto y no hay nada escrito a medias. */
export function puedeRecargarSola(e: EstadoPestana): boolean {
  return e.inactivaMs >= QUIETA_MS && !e.hayVentana && !e.escribiendo && !e.hayBorrador;
}

/** El error que da una pestaña con el código viejo al pedir un trozo de
 *  JavaScript que el despliegue ya ha borrado del servidor. Ahí recargar no
 *  pierde nada: la pantalla que se quería abrir no ha llegado a abrirse. */
export function esTrozoPerdido(mensaje: string): boolean {
  return /ChunkLoadError|Loading (CSS )?chunk [\w-]+ failed|Failed to load chunk|dynamically imported module|Importing a module script failed/i.test(mensaje);
}
