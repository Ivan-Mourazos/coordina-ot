import type { OF } from "./types";

// ─── De dónde viene el tiempo de una OF ──────────────────────────────────────
// Los minutos de una OF vienen de dos sitios y acaban sumados en el mismo
// campo: lo que está imputado en RPS (el terminal de fichaje de siempre, que se
// sigue usando a la vez que la web) y lo que se ha fichado aquí, que
// `aplicarTiemposFichaje` añade encima.
//
// Hay que poder separarlos para no enseñar el mismo dato dos veces: el desglose
// "Ya fichado en RPS" del detalle son minutos que también están dentro de
// `tiempoPlanteoMin`, así que la línea de Autor tiene que contar SOLO lo que se
// fichó en CoordinaOT. No es una cuestión de pedidos viejos: mientras se fiche
// en las dos herramientas, la mayoría del tiempo de hoy entra por RPS.

/** Minutos que vienen de RPS, según el propio desglose. */
export function minutosDeRps(of: OF): number {
  return (of.imputaciones ?? []).reduce((n, i) => n + i.minutos, 0);
}

/** Minutos de planteo fichados EN COORDINAOT: el total menos lo que ya venía
 *  imputado en RPS.
 *
 *  Cero significa que ese planteo se fichó entero con la herramienta antigua
 *  —hoy o hace dos años, da igual—, y entonces la línea de Autor no tiene nada
 *  propio que decir: lo dice el desglose de RPS, y además por persona.
 *
 *  Nunca negativo: si RPS trajera más de lo que suma el total (no debería), se
 *  queda en cero antes que enseñar un tiempo en rojo que no existe. */
export function minutosEnCoordina(of: OF): number {
  return Math.max(0, of.tiempoPlanteoMin - minutosDeRps(of));
}
