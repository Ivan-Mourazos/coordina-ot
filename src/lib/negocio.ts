// ─── El negocio, solo cuando añade algo ──────────────────────────────────────
//
// En RPS el negocio es el nombre comercial ("MAHOU, S.A. · CAFE BAR LUMA"),
// pero en los particulares se rellena con el propio cliente, y la web pintaba
// "CABALLERO PESCADOR, LUIS ANGEL · CABALLERO PESCADOR, LUIS ANGEL". Repetido no
// dice nada y se come el ancho de la línea.

const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** El negocio para enseñar junto al cliente, o null si no hay o es el mismo
 *  nombre (sin mirar mayúsculas, acentos, espacios ni puntuación). */
export function negocioAparte(
  cliente: string | null | undefined,
  negocio: string | null | undefined,
): string | null {
  const n = (negocio ?? "").trim();
  if (!n) return null;
  if (cliente && plano(cliente) === plano(n)) return null;
  return n;
}
