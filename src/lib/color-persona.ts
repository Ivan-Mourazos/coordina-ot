// ─── El color de la cara de cada persona ─────────────────────────────────────
// Cada uno puede elegir el suyo (Iván, 17/11/2026). Mientras no elija, sale el
// de siempre: el del catálogo del equipo (OT, Diseño, Impresión) o, para quien
// no está en él, uno derivado del nombre.

/** Tonos sobrios, separados entre sí, que se leen en claro y en oscuro. El
 *  ORDEN importa: el color derivado del nombre sale de aquí por posición, y
 *  cambiarlo cambiaría la cara de todo el que no ha elegido. */
export const PALETA = ["#3d7de0", "#1fa37a", "#9b3de0", "#d39a1c", "#e0533d", "#0d7f7f", "#4a5fd0", "#b0477a", "#5f8f2f", "#7a4fc0"] as const;

/** Lo que se puede elegir: la paleta y el gris de Ángel. Solo estos: un color
 *  libre acabaría en uno que no se lee sobre el fondo. */
export const COLORES_ELEGIBLES: readonly string[] = [...PALETA, "#5a6472"];

export function esColorElegible(c: unknown): c is string {
  return typeof c === "string" && COLORES_ELEGIBLES.includes(c);
}

/** El color de alguien que no ha elegido y no está en el catálogo. */
export function colorDeNombre(nombre: string): string {
  let h = 0;
  for (const c of nombre.toLocaleLowerCase("es")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}
