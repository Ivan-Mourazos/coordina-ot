// ─── El planteamiento de un pedido: nombres y tamaños ────────────────────────
// Los PDF de planteamiento los deja Oficina Técnica en la carpeta Planteamientos
// —desde CAD, a mano, igual que los genera toldos-testar— con el código del
// pedido SIN puntos y un sufijo: AR2605016-10.pdf (PVC), AR2605016-1.pdf
// (toldos). RPS los procesa en pocos minutos y los archiva con el código CON
// puntos, AR.26.05016-10.pdf, en una carpeta por año. Aquí está la regla de
// esos nombres, sin tocar disco, para que la búsqueda y los tests digan lo mismo.

const PEDIDO_RE = /^([A-Z]{2})\.(\d{2})\.(\d{5})$/;

export function partesPedido(codigo: string): { serie: string; yy: string; numero: string } | null {
  const m = PEDIDO_RE.exec(codigo.trim());
  return m ? { serie: m[1], yy: m[2], numero: m[3] } : null;
}

export function nombreCompacto(codigo: string): string | null {
  const p = partesPedido(codigo);
  return p ? `${p.serie}${p.yy}${p.numero}` : null;
}

export function anioPedido(codigo: string): number | null {
  const p = partesPedido(codigo);
  return p ? 2000 + Number(p.yy) : null;
}

/** El sufijo (`-10`, `-1`…) si el fichero es un planteamiento de ESTE pedido,
 *  con su nombre compacto o con el de RPS. Cualquier otra cosa —otro pedido,
 *  sin sufijo, «copia», otra extensión— es null: no se imprime lo que no se
 *  sabe seguro que es suyo. */
export function sufijoDe(fichero: string, codigo: string): string | null {
  const compacto = nombreCompacto(codigo);
  if (!compacto) return null;
  for (const base of [compacto, codigo]) {
    const m = new RegExp(`^${base.replace(/\./g, "\\.")}(-\\d{1,3})\\.pdf$`, "i").exec(fichero);
    if (m) return m[1];
  }
  return null;
}

export function nombreArchivoRps(codigo: string, sufijo: string): string {
  return `${codigo}${sufijo}.pdf`;
}

export function conAnio(plantilla: string, anio: number): string {
  return plantilla.replaceAll("{YYYY}", String(anio));
}

/** A4 en puntos PDF. El margen cubre el redondeo de cada programa de CAD. */
const A4_CORTO = 595.28;
const A4_LARGO = 841.89;
const MARGEN = 3;

export function esA4(ancho: number, alto: number): boolean {
  const [corto, largo] = ancho <= alto ? [ancho, alto] : [alto, ancho];
  return Math.abs(corto - A4_CORTO) <= MARGEN && Math.abs(largo - A4_LARGO) <= MARGEN;
}

/** ¿Va adjunto al correo? La norma de la casa (Iván, 14/10/2026): los de PVC
 *  (-10 en adelante: -10, -11, -12…) se mandan adjuntos; los de toldos y
 *  acrílico (-1 a -9) solo se imprimen arriba, y el correo avisa de que se
 *  imprimieron, sin el PDF. Un nombre que no es de este pedido, nunca. */
export function vaAdjunto(fichero: string, codigo: string): boolean {
  const s = sufijoDe(fichero, codigo);
  return s !== null && Number(s.slice(1)) >= 10;
}

/** Lo que se eligió a mano en el aviso de pasar, con «Cambiar lo que se
 *  imprime y se manda» (Iván, 14/10/2026: por si algo ya se imprimió, no va
 *  adjunto, o una OF no pinta en el correo). Si viene, manda sobre la norma de
 *  arriba; si no, se aplica la norma. Los nombres son de los PDF que vio el
 *  navegador: uno que aparezca después no se imprime ni se adjunta. */
export interface EleccionPase {
  /** PDF que se imprimen (vacío = ninguno). */
  imprimir: string[];
  /** PDF que van adjuntos al correo. */
  adjuntar: string[];
  /** Códigos de las OF que salen en el correo. */
  ofs: string[];
  /** Texto libre que sale arriba del correo. */
  nota: string;
}

export const NOTA_MAX = 1000;

const listaDeTextos = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length <= 200 && v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 200)
    ? (v as string[])
    : null;

/** La elección tal como llega en el cuerpo de la petición, o null si no viene
 *  o no tiene la forma esperada (y entonces vale la norma). */
export function leerEleccion(v: unknown): EleccionPase | null {
  if (typeof v !== "object" || v === null) return null;
  const x = v as Record<string, unknown>;
  const imprimir = listaDeTextos(x.imprimir);
  const adjuntar = listaDeTextos(x.adjuntar);
  const ofs = listaDeTextos(x.ofs);
  if (!imprimir || !adjuntar || !ofs || typeof x.nota !== "string") return null;
  return { imprimir, adjuntar, ofs, nota: x.nota.trim().slice(0, NOTA_MAX) };
}
