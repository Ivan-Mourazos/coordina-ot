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
  // ─── Conversaciones (fase 2, 16/11/2026) ───
  /** La nota a la que responde; null o ausente = nota raíz. */
  padreId?: number | null;
  /** Quién escribió la nota a la que responde (su id): para «te responde». */
  respondeA?: string | null;
  /** Solo en la raíz: cuándo se dio el hilo por resuelto, y quién. */
  resueltaAt?: string | null;
  resueltaPor?: string | null;
  /** Borrada pero con respuestas vivas: se pinta «nota borrada» en su sitio
   *  para no romper el hilo. Llega sin texto ni destinos. */
  borrada?: boolean;
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

// ─── El cuadro enseña nombres, la nota guarda tokens (16/11/2026) ──────────
// En el cuadro de escribir se ve `@Producción`; al guardar va `@[seccion:
// produccion]`. La conversión es de ida y vuelta exacta mientras cada etiqueta
// sea única, y por eso una persona cuyo nombre corto coincide con otro (o con
// una sección) usa el completo.

export interface PersonaEtiquetable {
  id: string;
  nombre: string;
  nombreCompleto?: string;
}

/** Cada destino mencionable con la etiqueta que se le ve en el cuadro. */
export function etiquetasMencion(
  personas: readonly PersonaEtiquetable[],
): Array<{ destino: Destino; etiqueta: string }> {
  const salida: Array<{ destino: Destino; etiqueta: string }> = SECCIONES_MENCIONABLES.map((s) => ({
    destino: { tipo: "seccion", id: s.id },
    etiqueta: s.nombre,
  }));
  const usadas = new Set(salida.map((e) => llano(e.etiqueta)));
  const veces = new Map<string, number>();
  for (const p of personas) veces.set(llano(p.nombre), (veces.get(llano(p.nombre)) ?? 0) + 1);
  for (const p of personas) {
    const corto = llano(p.nombre);
    let etiqueta = (veces.get(corto) ?? 0) > 1 || usadas.has(corto) ? (p.nombreCompleto ?? p.nombre) : p.nombre;
    if (usadas.has(llano(etiqueta))) etiqueta = `${etiqueta} (${p.id})`;
    usadas.add(llano(etiqueta));
    salida.push({ destino: { tipo: "persona", id: p.id }, etiqueta });
  }
  return salida;
}

/** Sin mayúsculas ni tildes, para comparar nombres. */
function llano(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Del texto guardado al del cuadro: cada token pasa a `@Etiqueta`. Un token
 *  de alguien que ya no está en la lista se queda tal cual. */
export function tokensAVisible(
  texto: string,
  etiquetas: ReadonlyArray<{ destino: Destino; etiqueta: string }>,
): string {
  const porClave = new Map(etiquetas.map((e) => [claveDestino(e.destino), e.etiqueta]));
  return texto.replace(MENCION, (todo, tipo: string, id: string) => {
    const e = porClave.get(`${tipo}:${id}`);
    return e ? `@${e}` : todo;
  });
}

/** Del cuadro al texto que se guarda: cada `@Etiqueta` conocida (y que no siga
 *  con otra letra o cifra) pasa a token. La más larga primero, para que
 *  «@Iván Sánchez» no se quede en «@Iván». */
export function visibleATokens(
  texto: string,
  etiquetas: ReadonlyArray<{ destino: Destino; etiqueta: string }>,
): string {
  return trozosVisibles(texto, etiquetas)
    .map((t) => (t.destino ? tokenMencion(t.destino) : t.texto))
    .join("");
}

/** El texto del cuadro partido en trozos, marcadas las menciones: para la
 *  capa que las resalta mientras se escribe. */
export function trocearVisible(
  texto: string,
  etiquetas: ReadonlyArray<{ destino: Destino; etiqueta: string }>,
): Array<{ texto: string; mencion: Destino["tipo"] | null }> {
  return trozosVisibles(texto, etiquetas).map((t) => ({ texto: t.texto, mencion: t.destino?.tipo ?? null }));
}

function trozosVisibles(
  texto: string,
  etiquetas: ReadonlyArray<{ destino: Destino; etiqueta: string }>,
): Array<{ texto: string; destino: Destino | null }> {
  const salida: Array<{ texto: string; destino: Destino | null }> = [];
  const ordenadas = texto.includes("@")
    ? [...etiquetas].sort((a, b) => b.etiqueta.length - a.etiqueta.length)
    : [];
  let suelto = "";
  let i = 0;
  while (i < texto.length) {
    if (texto[i] === "@" && ordenadas.length) {
      const resto = texto.slice(i + 1);
      const hallada = ordenadas.find(
        (e) => resto.startsWith(e.etiqueta) && !/^[\p{L}\p{N}]/u.test(resto.slice(e.etiqueta.length)),
      );
      if (hallada) {
        if (suelto) salida.push({ texto: suelto, destino: null });
        suelto = "";
        salida.push({ texto: `@${hallada.etiqueta}`, destino: hallada.destino });
        i += 1 + hallada.etiqueta.length;
        continue;
      }
    }
    suelto += texto[i];
    i++;
  }
  if (suelto) salida.push({ texto: suelto, destino: null });
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

export interface FilaHilo {
  nota: NotaPedido;
  nivel: number;
  /** La nota que abre la conversación. */
  raizId: number;
  /** Solo en la raíz: cuántas respuestas vivas cuelgan de ella. */
  respuestas: number;
  /** Solo en la raíz: si sus respuestas están escondidas. */
  plegada: boolean;
}

/** El hilo en el orden en que se pinta: cada nota seguida de sus respuestas,
 *  en profundidad. Las de una conversación plegada no salen. `aMano` dice si
 *  alguien la plegó (true) o la abrió (false); sin decir, plegadas las resueltas. */
export function ordenarHilo(
  notas: readonly NotaPedido[],
  aMano: (raizId: number) => boolean | undefined,
): FilaHilo[] {
  const ids = new Set(notas.map((n) => n.id));
  const hijos = new Map<number | null, NotaPedido[]>();
  for (const n of notas) {
    // Un padre que no llegó cuelga como raíz: mejor suelta que perdida.
    const p = n.padreId != null && ids.has(n.padreId) ? n.padreId : null;
    hijos.set(p, [...(hijos.get(p) ?? []), n]);
  }
  const contar = (id: number): number =>
    (hijos.get(id) ?? []).reduce((t, h) => t + (h.borrada ? 0 : 1) + contar(h.id), 0);
  const salida: FilaHilo[] = [];
  const bajar = (padre: number, nivel: number, raizId: number) => {
    for (const h of hijos.get(padre) ?? []) {
      salida.push({ nota: h, nivel, raizId, respuestas: 0, plegada: false });
      bajar(h.id, nivel + 1, raizId);
    }
  };
  for (const r of hijos.get(null) ?? []) {
    const plegada = aMano(r.id) ?? !!r.resueltaAt;
    salida.push({ nota: r, nivel: 0, raizId: r.id, respuestas: contar(r.id), plegada });
    if (!plegada) bajar(r.id, 1, r.id);
  }
  return salida;
}
