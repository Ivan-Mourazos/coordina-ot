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
export function vaAdjunto(fichero: string, codigo: string, pedidoDePvc = false): boolean {
  const s = sufijoDe(fichero, codigo);
  return s !== null && (pedidoDePvc || Number(s.slice(1)) >= 10);
}

/** ¿El texto dice que la pieza ES de PVC? «Ventana en PVC transparente» no:
 *  es un toldo acrílico con una ventana, y se imprime como los acrílicos. */
export function textoDicePvc(texto: string | null | undefined): boolean {
  const t = (texto ?? "").toUpperCase().replace(/VENTANA[^.,;]*?PVC/g, "");
  return /\bPVC\b/.test(t);
}

/** ¿El pedido es de PVC? Así se decide que su planteamiento va ADJUNTO al
 *  correo (Iván, 10/11/2026: «vale para todo», toldos, fundas, solapas, lonas).
 *
 *  El sufijo -10 no basta: lo ponen solos remolques y puertas, y un toldo de
 *  PVC sale de Planteamientos o de ZWCAD como -1 o -2 (AR.26.05080). Ni el
 *  programa que hizo el PDF lo distingue: ZWCAD y la impresora PDF sirven
 *  igual para PVC que para acrílico. Lo que sí lo dice es RPS, medido en las
 *  OF de toldo de 2026:
 *   - la RUTA: «SOLDAR PVC», «CORTAR PAÑOS - PVC»… (115 OF; en acrílico, 1);
 *   - la LÍNEA del pedido: «lona poliéster recubierta de PVC 580…», que cubre
 *     las que no llevan tarea de PVC (fundas, ELIT, verticales…).
 *  Basta una OF: en un pedido mixto va adjunto todo, mejor de más que un PVC
 *  sin su PDF. En el aviso de pasar se puede cambiar a mano. */
export function esPedidoDePvc(ofs: readonly { tareas: readonly string[]; linea: string | null }[]): boolean {
  return ofs.some((of) => of.tareas.some((t) => /\bPVC\b/i.test(t)) || textoDicePvc(of.linea));
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
export const PAPELES: Record<Papel, [number, number]> = {
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


// ─── Qué páginas salen en cada impresora (Iván, 04/11/2026) ──────────────────
// De serie, cada página va a la impresora que tiene su papel (`DESTINO_DE_PAPEL`).
// En el aviso de pasar, «Elegir páginas…» deja marcar cada página en cada
// impresora por separado: el A5 en Producción (sale ampliado a A4) sin quitarlo
// de la de OT, un A4 también en la de OT… Cada impresora con su orientación.

export type ImpresoraId = "produccion" | "ot";
export const IMPRESORAS: readonly ImpresoraId[] = ["produccion", "ot"];

export interface PaginaElegida {
  /** Desde 1. */
  pagina: number;
  orientacion: Orientacion;
}

/** Las páginas marcadas en cada impresora, de un PDF. */
export type SeleccionPaginas = Record<ImpresoraId, PaginaElegida[]>;

const natural = (p: PaginaPdf): Orientacion => (p.horizontal ? "horizontal" : "vertical");

export function seleccionDeSerie(paginas: readonly PaginaPdf[]): SeleccionPaginas {
  const sel: SeleccionPaginas = { produccion: [], ot: [] };
  paginas.forEach((p, i) => {
    if (p.papel) sel[DESTINO_DE_PAPEL[p.papel] as ImpresoraId].push({ pagina: i + 1, orientacion: natural(p) });
  });
  return sel;
}

/** Un trabajo para una impresora: un PDF con esas páginas en un papel. */
export interface TrabajoPlan {
  impresora: ImpresoraId;
  /** El papel en que sale: Producción solo tiene A4. */
  papel: Papel;
  /** `girar`: un cuarto de vuelta, porque se eligió la orientación contraria
   *  a como viene. `ajustar`: la página no es de este papel y se escala. */
  paginas: { pagina: number; girar: boolean; ajustar: boolean }[];
}

/** Los papeles de cada impresora (04/11/2026). */
const PAPELES_DE: Record<ImpresoraId, readonly Papel[]> = { produccion: ["A4"], ot: ["A3", "A4", "A5"] };

/** Lo marcado, convertido en trabajos: uno para Producción (todo en A4) y en la
 *  de OT uno por papel, porque cada uno sale de su bandeja. */
export function trabajosDe(paginas: readonly PaginaPdf[], sel: SeleccionPaginas): TrabajoPlan[] {
  const trabajos: TrabajoPlan[] = [];
  for (const impresora of IMPRESORAS) {
    const porPapel = new Map<Papel, TrabajoPlan>();
    const vistas = new Set<number>();
    for (const e of [...sel[impresora]].sort((a, b) => a.pagina - b.pagina)) {
      const p = paginas[e.pagina - 1];
      if (!p || vistas.has(e.pagina)) continue;
      vistas.add(e.pagina);
      const tiene = p.papel !== null && PAPELES_DE[impresora].includes(p.papel);
      const papel = tiene ? p.papel! : "A4";
      let t = porPapel.get(papel);
      if (!t) porPapel.set(papel, (t = { impresora, papel, paginas: [] }));
      t.paginas.push({ pagina: e.pagina, girar: e.orientacion !== natural(p), ajustar: !tiene });
    }
    trabajos.push(...porPapel.values());
  }
  return trabajos;
}

/** Las páginas que no van a ninguna impresora y que, de serie, se imprimían a
 *  mano (las de un tamaño raro). Si se elige a mano, las demás no se imprimen. */
export function paginasSinImpresora(paginas: readonly PaginaPdf[], sel: SeleccionPaginas, deSerie: boolean): number[] {
  if (!deSerie) return [];
  const marcadas = new Set(IMPRESORAS.flatMap((i) => sel[i].map((e) => e.pagina)));
  return paginas.flatMap((p, i) => (p.papel === null && !marcadas.has(i + 1) ? [i + 1] : []));
}

/** Clave de una impresora de un PDF en «Ajustes de la impresora…». */
export const claveTrabajo = (fichero: string, impresora: ImpresoraId) => `${fichero}|${impresora}`;

/** Lo que se elige en el aviso de pasar. `paginas`: solo los PDF en que se
 *  entró a elegir; los demás, de serie. `aMano`: impresoras de un PDF que se
 *  imprimen desde el cuadro de imprimir (`claveTrabajo`). */
export interface AjustesImpresion {
  paginas: Record<string, SeleccionPaginas>;
  aMano: string[];
}

export const AJUSTES_DE_SERIE: AjustesImpresion = { paginas: {}, aMano: [] };

const CLAVE_TRABAJO_RE = /^[^|]{1,200}\|(produccion|ot)$/;

function leerElegidas(v: unknown): PaginaElegida[] | null {
  if (!Array.isArray(v)) return null;
  const r: PaginaElegida[] = [];
  for (const e of v.slice(0, 500)) {
    const x = e as Record<string, unknown> | null;
    if (!x || !Number.isInteger(x.pagina) || (x.pagina as number) < 1 || (x.pagina as number) > 999) return null;
    if (x.orientacion !== "vertical" && x.orientacion !== "horizontal") return null;
    r.push({ pagina: x.pagina as number, orientacion: x.orientacion });
  }
  return r;
}

export function leerAjustesImpresion(v: unknown): AjustesImpresion | null {
  if (typeof v !== "object" || v === null) return null;
  const x = v as Record<string, unknown>;
  const paginas: Record<string, SeleccionPaginas> = {};
  if (typeof x.paginas === "object" && x.paginas !== null) {
    for (const [fichero, s] of Object.entries(x.paginas as Record<string, unknown>).slice(0, 20)) {
      if (fichero.length > 200 || typeof s !== "object" || s === null) continue;
      const produccion = leerElegidas((s as Record<string, unknown>).produccion);
      const ot = leerElegidas((s as Record<string, unknown>).ot);
      if (produccion && ot) paginas[fichero] = { produccion, ot };
    }
  }
  const aMano = Array.isArray(x.aMano) ? x.aMano.filter((k): k is string => typeof k === "string" && CLAVE_TRABAJO_RE.test(k)).slice(0, 50) : [];
  return { paginas, aMano };
}

/** Las páginas de un trabajo para la dirección del PDF: «1,3», «0,1», «A4». */
export function consultaTrabajo(t: Pick<TrabajoPlan, "papel" | "paginas">): { paginas: string; girar: string; papel: string } {
  return {
    paginas: t.paginas.map((p) => p.pagina).join(","),
    girar: t.paginas.map((p) => (p.girar ? "1" : "0")).join(","),
    papel: t.paginas.some((p) => p.ajustar) ? t.papel : "",
  };
}
