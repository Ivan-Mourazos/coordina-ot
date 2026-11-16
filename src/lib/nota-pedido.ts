// ─── Notas de un pedido: el contrato y sus reglas ────────────────────────────
// Client-safe: no toca la BD ni importa nada de servidor. Lo comparten la ruta
// de la API y el componente del hilo, para que la validación sea la misma en
// los dos lados y no se puedan separar.
//
// La nota cuelga del CÓDIGO del pedido ("AR.26.03914"), no de su id interno:
// en el tablero el id sale del agrupado de RPS y en el Historial es "hist:…",
// así que una nota colgada del id se perdería justo al pasar a Producción, que
// es cuando más se quiere leer. Ver el spec del 2026-08-23.

import type { SeccionId } from "./secciones";

export interface NotaPedido {
  id: number;
  /** Código del pedido. También vale el sintético de las OF sueltas. */
  pedido: string;
  operarioId: string;
  texto: string;
  /** ISO. */
  creadoAt: string;
  /** ISO, o null si nunca se editó. */
  editadoAt: string | null;
  /** «Para todos»: la ve también la consulta sin sesión (Producción,
   *  comerciales). Por defecto no: una nota interna que sale de OT es peor
   *  que una para todos que se queda dentro. */
  publica: boolean;
  /** Para quién es. Vacío = para todos (el caso normal). Con algo dentro,
   *  solo la ven esas personas y secciones, y su autor. */
  para: Destino[];
  /** Sale también en la consulta pública sin sesión. Nunca si `para` tiene
   *  algo: una nota restringida no se enseña a quien no ha entrado. */
  enConsultaPublica: boolean;
  /** A quién nombra con `@`, sacado del texto al guardar. */
  menciones: Destino[];
  /** Solo en los avisos de la campana: cuándo te llegó (la mención o el
   *  público que te incluye), que puede ser después de escribirse la nota. */
  avisoAt?: string;
  /** Nombre de quien la escribió, de la tabla de personas. Para las cuentas
   *  que no son del tablero (Belén, de Producción): sin él, el hilo del
   *  equipo enseñaría su id en vez de su nombre. */
  autor?: string | null;
}

// ─── Destinos y menciones (16/11/2026, docs/NOTAS-MENCIONES.md) ─────────────
// Una mención se guarda en el texto como `@[persona:ivan]` o
// `@[seccion:produccion]`: un formato fijo que identifica a quién sin depender
// del nombre (que cambia) y que se pinta como etiqueta con el nombre de hoy.

/** Las secciones a las que se puede escribir: las tres del tablero y las dos
 *  que salen de los roles (Producción y Dirección). */
export type DestinoSeccion = SeccionId | "produccion" | "direccion";

export type Destino = { tipo: "persona"; id: string } | { tipo: "seccion"; id: DestinoSeccion };

export const SECCIONES_MENCIONABLES: ReadonlyArray<{ id: DestinoSeccion; nombre: string }> = [
  { id: "ot", nombre: "Oficina Técnica" },
  { id: "diseno", nombre: "Diseño" },
  { id: "impresion", nombre: "Impresión" },
  { id: "produccion", nombre: "Producción" },
  { id: "direccion", nombre: "Dirección" },
];

export function esSeccionMencionable(id: string): id is DestinoSeccion {
  return SECCIONES_MENCIONABLES.some((s) => s.id === id);
}

/** Lo que se escribe en el texto para mencionar a alguien. */
export function tokenMencion(d: Destino): string {
  return `@[${d.tipo}:${d.id}]`;
}

/** La clave de un destino tal como la guardan las tablas y el lector:
 *  "persona:ivan", "seccion:ot". */
export function claveDestino(d: Destino): string {
  return `${d.tipo}:${d.id}`;
}

// Global: se usa con matchAll/replace, que necesitan la bandera.
const MENCION = /@\[(persona|seccion):([a-z0-9-]+)\]/g;

function destinoDe(tipo: string, id: string): Destino | null {
  if (tipo === "persona") return { tipo: "persona", id };
  return esSeccionMencionable(id) ? { tipo: "seccion", id } : null;
}

/** Las menciones de un texto, sin repetir y en el orden en que aparecen. Una
 *  sección que no existe no cuenta (se queda como texto). */
export function extraerMenciones(texto: string): Destino[] {
  const vistos = new Set<string>();
  const salida: Destino[] = [];
  for (const m of texto.matchAll(MENCION)) {
    const d = destinoDe(m[1], m[2]);
    if (!d || vistos.has(claveDestino(d))) continue;
    vistos.add(claveDestino(d));
    salida.push(d);
  }
  return salida;
}

export type Trozo = { tipo: "texto"; texto: string } | { tipo: "mencion"; destino: Destino };

/** El texto partido en trozos para pintar las menciones como etiquetas. */
export function trocearTexto(texto: string): Trozo[] {
  const salida: Trozo[] = [];
  let pendiente = "";
  let desde = 0;
  for (const m of texto.matchAll(MENCION)) {
    const d = destinoDe(m[1], m[2]);
    pendiente += texto.slice(desde, m.index);
    desde = m.index + m[0].length;
    if (!d) {
      pendiente += m[0];
      continue;
    }
    if (pendiente) salida.push({ tipo: "texto", texto: pendiente });
    pendiente = "";
    salida.push({ tipo: "mencion", destino: d });
  }
  pendiente += texto.slice(desde);
  if (pendiente) salida.push({ tipo: "texto", texto: pendiente });
  return salida;
}

/** Lo que ve de una nota quien no tiene sesión: el texto, quién y cuándo.
 *  Ni ids ni pedido: la pide ya dentro de su pedido. */
export interface NotaPublica {
  texto: string;
  /** Nombre de quien la escribió; «Coordina» si la escribió la web. */
  autor: string;
  creadoAt: string;
  editadoAt: string | null;
}

/** Tope de una nota. Es un recado, no un informe: con dos mil caracteres caben
 *  unas treinta líneas, de sobra para lo que se apunta en un post-it. El tope
 *  existe para que un pegado accidental no reviente la ficha. */
export const NOTA_MAX = 2000;

export type TextoValido =
  | { ok: true; texto: string }
  | { ok: false; motivo: "vacio" | "largo" };

/** Deja el texto como se va a guardar, o dice por qué no vale.
 *
 *  Devuelve el motivo y no solo `null` para que la ruta pueda decir qué pasa:
 *  "no has escrito nada" y "te has pasado de largo" se arreglan de formas
 *  distintas, y un 400 mudo obliga a adivinar cuál de las dos es.
 *
 *  Los saltos de Windows se normalizan a `\n`: el texto entra desde un
 *  `<textarea>` y se vuelve a pintar con `whitespace-pre-line`, así que
 *  guardar `\r\n` mete un carácter invisible que no aporta nada. */
export function validarTexto(crudo: unknown): TextoValido {
  if (typeof crudo !== "string") return { ok: false, motivo: "vacio" };
  const texto = crudo.replace(/\r\n/g, "\n").trim();
  if (texto.length === 0) return { ok: false, motivo: "vacio" };
  // El tope se mide sobre el texto YA recortado: si no, unos espacios de más
  // al pegar rechazarían una nota que cabe de sobra.
  if (texto.length > NOTA_MAX) return { ok: false, motivo: "largo" };
  return { ok: true, texto };
}

/** Cuándo se escribió, en corto: "hoy 11:04", "ayer 9:30", "18/8 12:16".
 *
 *  Con la hora siempre, que en un hilo de recados del mismo día es lo único
 *  que ordena. Y con el año solo cuando no es el de hoy: en los normales gasta
 *  sitio para decir lo que ya se sabe. */
export function fmtCuandoNota(iso: string, ahora: string): string {
  const d = new Date(iso);
  const hoy = new Date(ahora);
  const hora = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const mismoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mismoDia(d, hoy)) return `hoy ${hora}`;
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  if (mismoDia(d, ayer)) return `ayer ${hora}`;
  const dia = `${d.getDate()}/${d.getMonth() + 1}`;
  return d.getFullYear() === hoy.getFullYear()
    ? `${dia} ${hora}`
    : `${dia}/${d.getFullYear()} ${hora}`;
}
