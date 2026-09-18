// ─── Tinta sobre un color de persona ─────────────────────────────────────────
//
// Las iniciales de los avatares iban siempre en blanco. Sobre el dorado de Iván
// se leían a 2,5:1 y sobre el verde de Adrián a 3,2:1, por debajo del 4,5 que
// pide un texto de 10 px. No se oscurece el color de cada uno —es lo que lo
// identifica en todo el tablero—: se elige la tinta, blanca u oscura, la que
// más contraste dé. Es el mismo criterio que ya seguía `PRIORIDAD.tinta` con el
// dorado de "Normal".

const OSCURA = "#1a1206";
const BLANCA = "#ffffff";

const canal = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const luminancia = (hex: string): number | null => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
};

const contraste = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Color del texto que va encima de `fondo` (hex `#rrggbb`). Si el color no se
 *  entiende, blanco: era lo que había. */
export function tintaSobre(fondo: string): string {
  const l = luminancia(fondo);
  if (l === null) return BLANCA;
  const lOscura = luminancia(OSCURA)!;
  return contraste(l, 1) >= contraste(l, lOscura) ? BLANCA : OSCURA;
}
