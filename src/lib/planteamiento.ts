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

/** La nota del correo cuando no se ha cambiado nada más: va suelta, sin
 *  `EleccionPase`, para que escribirla no obligue a fijar a mano qué se
 *  imprime y qué va adjunto. Vacía o con otra forma = sin nota. */
export function leerNotaCorreo(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  return v.trim().slice(0, NOTA_MAX) || undefined;
}

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

// ─── Reparto por tamaño de página (Iván, 04/11/2026) ─────────────────────────
// Un planteamiento con un A5 dentro se imprimía entero a mano: se mandaban los
// A4 a Producción desde el cuadro de imprimir y luego había que buscar el plano
// para sacar el A5 en OT. Ahora el PDF se parte por tamaño y cada parte va sola
// a la impresora que tiene ese papel: A4 a Producción, A5 y A3 a la de OT (es la
// única con esos papeles cargados, 04/11/2026). Lo de otros tamaños, a mano.

export type Papel = "A4" | "A5" | "A3";
export type DestinoParte = "produccion" | "ot" | "manual";
export type Orientacion = "vertical" | "horizontal";

/** Lado corto y largo de cada papel, en puntos PDF. */
const PAPELES: Record<Papel, [number, number]> = {
  A5: [419.53, 595.28],
  A4: [595.28, 841.89],
  A3: [841.89, 1190.55],
};

export function papelDe(ancho: number, alto: number): Papel | null {
  const [corto, largo] = ancho <= alto ? [ancho, alto] : [alto, ancho];
  for (const [papel, [c, l]] of Object.entries(PAPELES) as [Papel, [number, number]][]) {
    if (Math.abs(corto - c) <= MARGEN && Math.abs(largo - l) <= MARGEN) return papel;
  }
  return null;
}

/** Cada página tal como se ve (con su giro ya aplicado). */
export interface PaginaPdf {
  papel: Papel | null;
  horizontal: boolean;
}

export interface ParteImpresion {
  /** null = un tamaño que no es A3, A4 ni A5. */
  papel: Papel | null;
  /** Números de página, desde 1, en su orden. */
  paginas: number[];
  destino: DestinoParte;
  /** Cómo viene la primera página de la parte. */
  horizontal: boolean;
}

export const DESTINO_DE_PAPEL: Record<Papel, DestinoParte> = { A4: "produccion", A5: "ot", A3: "ot" };

/** Las páginas, agrupadas por papel en el orden en que aparece cada uno. */
export function partesDe(paginas: readonly PaginaPdf[]): ParteImpresion[] {
  const partes = new Map<string, ParteImpresion>();
  paginas.forEach((p, i) => {
    const clave = p.papel ?? "otro";
    const parte = partes.get(clave);
    if (parte) parte.paginas.push(i + 1);
    else partes.set(clave, { papel: p.papel, paginas: [i + 1], destino: p.papel ? DESTINO_DE_PAPEL[p.papel] : "manual", horizontal: p.horizontal });
  });
  return [...partes.values()];
}

/** La clave de una parte en lo que manda el navegador: fichero y papel. */
export const claveParte = (fichero: string, papel: Papel | null) => `${fichero}|${papel ?? "otro"}`;

/** Lo que se elige en el aviso de pasar para cada parte: cómo va (vertical u
 *  horizontal) y si se imprime a mano con «Ajustes de la impresora…». */
export interface AjustesImpresion {
  orientaciones: Record<string, Orientacion>;
  aMano: string[];
}

const CLAVE_PARTE_RE = /^[^|]{1,200}\|(A3|A4|A5|otro)$/;

export function leerAjustesImpresion(v: unknown): AjustesImpresion | null {
  if (typeof v !== "object" || v === null) return null;
  const x = v as Record<string, unknown>;
  const orientaciones: Record<string, Orientacion> = {};
  if (typeof x.orientaciones === "object" && x.orientaciones !== null) {
    for (const [k, o] of Object.entries(x.orientaciones as Record<string, unknown>).slice(0, 50)) {
      if (CLAVE_PARTE_RE.test(k) && (o === "vertical" || o === "horizontal")) orientaciones[k] = o;
    }
  }
  const aMano = Array.isArray(x.aMano) ? x.aMano.filter((k): k is string => typeof k === "string" && CLAVE_PARTE_RE.test(k)).slice(0, 50) : [];
  return { orientaciones, aMano };
}

/** ¿Hay que girar la parte para que quede como se eligió? */
export function hayQueGirar(parte: Pick<ParteImpresion, "horizontal">, elegida: Orientacion | undefined): boolean {
  return elegida !== undefined && (elegida === "horizontal") !== parte.horizontal;
}
