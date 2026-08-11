import type { HistorialItem } from "./historial";
import { ofOcultaDeOT } from "./fases-tablero";
import type { Pedido } from "./types";

// ─── Buscador global: encontrar UN pedido sin saber dónde está ───────────────
// Todas las listas de la app enseñan un recorte: la Lista quita lo pasado a
// Producción, el tablero esconde lo de taller, el Historial solo tiene lo que
// RPS ya cerró. Cada recorte está bien donde está, pero juntos hacen que
// buscar un pedido concreto sea adivinar en qué pestaña cayó. Esto busca en
// todo a la vez y, sobre todo, DICE DÓNDE ESTÁ cada resultado: es la mitad de
// la respuesta que hacía falta.
//
// La búsqueda es por trozos, no por código entero: en la oficina un pedido es
// "el 3948", no "AR.26.03948". Por eso se normaliza quitando puntos y ceros a
// la izquierda, y por eso dos dígitos ya buscan.

/** Mínimo para empezar a buscar. Con una sola letra o dígito, media oficina
 *  encaja y la lista no dice nada. */
export const MIN_LETRAS = 2;

/** Sin acentos, sin puntuación y en mayúsculas: "AR.26.03948" y "ar 26 03948"
 *  tienen que ser lo mismo escrito de dos maneras. */
export function normaliza(s: string): string {
  return palabrasDe(s).join("");
}

/** Igual, pero conservando la separación entre palabras.
 *
 *  Hace falta para lo que se escribe hablando: "toldo fachada" tiene que
 *  encontrar "TOLDO DE FACHADA", y pegando las palabras ("TOLDOFACHADA") no la
 *  encuentra nunca. Para los CÓDIGOS es al revés y por eso conviven las dos:
 *  ahí lo que hay que borrar son los puntos, no las palabras. */
export function palabrasDe(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

/** Dónde vive el resultado. Solo para el color del distintivo; el texto va en
 *  `donde`, que es lo que se lee. */
export type Ubicacion = "sinAsignar" | "conAutor" | "historial" | "taller" | "fuera";

export interface Resultado {
  /** Con qué abrirlo: el id del pedido si es del tablero, el código si es del
   *  historial (que no tiene más identidad que esa). */
  clave: string;
  codigo: string;
  cliente: string;
  negocio?: string;
  /** "Sin asignar", "Iván", "En el historial"… La respuesta a "¿dónde está?". */
  donde: string;
  ubicacion: Ubicacion;
  /** Coletilla de segunda fila: lo que matiza sin ser la ubicación ("1 de
   *  taller", "2 detenidas", la fecha del historial). */
  extra?: string;
  fuente: "tablero" | "historial";
  puntos: number;
}

// ─── Dónde está un pedido del tablero ────────────────────────────────────────

function nombres(ids: readonly string[], nombre: (id: string) => string): string {
  const unicos = [...new Set(ids)].map(nombre);
  if (unicos.length <= 2) return unicos.join(" y ");
  return `${unicos.slice(0, 2).join(", ")} +${unicos.length - 2}`;
}

const plural = (n: number, sing: string, pl: string) => `${n} ${n === 1 ? sing : pl}`;

/** La respuesta a "¿dónde está este pedido?", en el orden en que importa:
 *  primero si está FUERA del trabajo de OT (pasado, anulado, de taller), y solo
 *  si sigue siendo nuestro, de quién es. */
export function ubicacionDe(
  p: Pedido,
  nombre: (id: string) => string,
): { donde: string; ubicacion: Ubicacion; extra?: string } {
  if (p.situacion === "completado") {
    return { donde: "Pasado a Producción", ubicacion: "fuera", extra: "esperando a RPS" };
  }
  const vivas = p.ofs.filter((o) => o.estado !== "anulada");
  if (vivas.length === 0) return { donde: "Anulada", ubicacion: "fuera" };

  const deOT = vivas.filter((o) => !ofOcultaDeOT(o));
  if (deOT.length === 0) {
    // Todas entran por tarea de taller: el pedido existe y sale en el buscador
    // —para eso es global— pero no es trabajo de Oficina Técnica.
    return { donde: "De taller", ubicacion: "taller", extra: plural(vivas.length, "OF", "OF") };
  }

  // Matices que no cambian DÓNDE está pero se agradecen antes de abrirlo.
  const matices: string[] = [];
  const detenidas = deOT.filter((o) => o.detenida).length;
  const deTaller = vivas.length - deOT.length;
  if (detenidas > 0) matices.push(plural(detenidas, "detenida", "detenidas"));
  if (deTaller > 0) matices.push(`${deTaller} de taller`);
  const extra = matices.length > 0 ? matices.join(" · ") : undefined;

  const conAutor = deOT.filter((o) => o.autorId !== null);
  const sinAutor = deOT.length - conAutor.length;
  if (conAutor.length === 0) return { donde: "Sin asignar", ubicacion: "sinAsignar", extra };

  const quien = nombres(conAutor.map((o) => o.autorId as string), nombre);
  return {
    donde: sinAutor > 0 ? `${quien} · ${sinAutor} sin asignar` : quien,
    ubicacion: "conAutor",
    extra,
  };
}

// ─── Puntuación ──────────────────────────────────────────────────────────────
// Un pedido no se busca de una sola manera: unas veces es "3948", otras
// "mahou", otras el nº de la OF que tienes delante en papel. Cada forma de
// acertar puntúa distinto para que lo que buscabas salga arriba y no en el
// séptimo sitio, detrás de siete clientes que llevan la misma sílaba.

const SIN_CEROS = /^0+/;

/** Lo buscable de un pedido, ya normalizado. Se calcula una vez por pedido. */
export interface Indice {
  /** "AR2603948" */
  codigo: string;
  /** "03948": el número corto, que es como se llaman los pedidos hablando. */
  numero: string;
  cliente: string;
  ofs: string[];
  /** Cliente y descripciones CON los espacios: es lo que se busca por palabras
   *  sueltas y en cualquier orden ("fachada toldo"). */
  palabras: string[];
}

/** `cliente` y `texto` van por separado y no da igual: el cliente se busca
 *  entero y desde dos letras ("mah"), y la descripción solo por palabras y con
 *  más cuerpo. Metidos en el mismo saco, "to" encontraría todos los TOLDOS. */
const indice = (codigo: string, ofs: string[], cliente: string, texto: string): Indice => ({
  codigo: normaliza(codigo),
  numero: normaliza(codigo.split(".").pop() ?? codigo),
  cliente: normaliza(cliente),
  ofs: ofs.map(normaliza),
  palabras: palabrasDe(`${cliente} ${texto}`),
});

export function indiceDePedido(p: Pedido): Indice {
  return indice(
    p.codigo,
    p.ofs.map((o) => o.codigo),
    `${p.cliente} ${p.negocio ?? ""}`,
    // Con la subfamilia de RPS: "puertas" o "reparaciones" es como se llama al
    // trabajo hablando, y no siempre está en la descripción de la OF.
    p.ofs.map((o) => `${o.descripcion} ${o.familia} ${o.subfamilia ?? ""}`).join(" "),
  );
}

export function indiceDeHistorial(it: HistorialItem): Indice {
  // Sin OF ni descripciones: la página del historial no las trae, y pedirlas
  // por cada resultado serían 40 consultas a RPS por tecla.
  return indice(it.pedido, [], it.cliente ?? "", "");
}

/** Cuánto encaja la consulta con este índice. `null` = no encaja.
 *
 *  El orden de los tramos ES la decisión de diseño: el número del pedido gana
 *  a todo, porque escribir cuatro dígitos solo puede significar una cosa.
 *
 *  `q` viene sin espacios (para códigos) y `busca` con ellos (para texto): son
 *  la misma consulta escrita para las dos formas de comparar. */
export function puntua(i: Indice, q: string, busca: readonly string[]): number | null {
  const numeroPelado = i.numero.replace(SIN_CEROS, "");
  const qPelada = q.replace(SIN_CEROS, "");

  if (i.numero === q || numeroPelado === qPelada || i.codigo === q) return 1000;
  if (i.numero.startsWith(q) || numeroPelado.startsWith(qPelada)) return 800;
  if (i.codigo.startsWith(q)) return 700;
  if (i.ofs.some((c) => c === q)) return 650;
  if (i.ofs.some((c) => c.startsWith(q))) return 600;
  if (i.cliente.startsWith(q)) return 500;
  // "Contiene" va al final entero: encaja mucho y acierta poco.
  if (i.codigo.includes(q)) return 400;
  if (i.cliente.includes(q)) return 300;
  if (i.ofs.some((c) => c.includes(q))) return 250;
  // Por palabras y TODAS: "toldo fachada" no puede traer los toldos por un
  // lado y las fachadas por otro. En cualquier orden, eso sí, que nadie
  // recuerda cómo estaba escrita la descripción.
  // `busca` vacía (consulta demasiado corta) NO puede colar: `every` sobre una
  // lista vacía es cierto, y eso haría encajar el pedido con lo que sea.
  if (busca.length > 0 && busca.every((w) => i.palabras.some((p) => p.includes(w)))) return 200;
  return null;
}

// ─── Buscar ──────────────────────────────────────────────────────────────────

export interface FuentesBusqueda {
  /** Todo lo que hay en el tablero, SIN filtrar: el buscador existe para
   *  encontrar también lo que las vistas esconden. */
  pedidos: readonly Pedido[];
  /** Lo que devolvió /api/historial para esta misma consulta. */
  historial: readonly HistorialItem[];
  nombre: (id: string) => string;
}

/** Cuántos se enseñan. Una lista larga en un desplegable no se lee: si no está
 *  en los diez primeros, lo que hay que hacer es escribir una letra más. */
export const TOPE_RESULTADOS = 10;

export function buscar(consulta: string, f: FuentesBusqueda): Resultado[] {
  const q = normaliza(consulta);
  if (q.length < MIN_LETRAS) return [];
  // Con una o dos letras, buscar por palabras engancha media lista ("TO" esta
  // en TOLDO, MOTOR, AUTOMATICO): ese tramo solo entra con cuerpo.
  const busca = q.length >= 3 ? palabrasDe(consulta) : [];

  const salida: Resultado[] = [];
  const yaEstan = new Set<string>();

  for (const p of f.pedidos) {
    const puntos = puntua(indiceDePedido(p), q, busca);
    if (puntos === null) continue;
    yaEstan.add(p.codigo);
    salida.push({
      clave: p.id,
      codigo: p.codigo,
      cliente: p.cliente,
      negocio: p.negocio,
      fuente: "tablero",
      puntos,
      ...ubicacionDe(p, f.nombre),
    });
  }

  for (const it of f.historial) {
    // El mismo pedido puede estar en los dos sitios mientras RPS lo cierra.
    // Manda el del tablero: es el que se puede abrir y tocar.
    if (yaEstan.has(it.pedido)) continue;
    const puntos = puntua(indiceDeHistorial(it), q, busca);
    if (puntos === null) continue;
    salida.push({
      clave: it.pedido,
      codigo: it.pedido,
      cliente: it.cliente ?? "Sin cliente",
      negocio: it.negocio ?? undefined,
      donde: "En el historial",
      ubicacion: "historial",
      extra: it.autores?.length ? nombres(it.autores, (n) => n) : undefined,
      fuente: "historial",
      puntos,
    });
  }

  return salida
    .sort(
      (a, b) =>
        b.puntos - a.puntos ||
        // A igualdad, lo vivo antes que lo archivado y lo nuevo antes que lo
        // viejo: el pedido que buscas casi siempre es el de esta semana.
        Number(a.fuente === "historial") - Number(b.fuente === "historial") ||
        b.codigo.localeCompare(a.codigo),
    )
    .slice(0, TOPE_RESULTADOS);
}
