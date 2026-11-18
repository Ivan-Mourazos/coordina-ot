// ─── Qué ha escrito: un pedido, una OF o un cliente ──────────────────────────
// En la oficina un pedido se escribe de mil maneras: "AR.26.05448",
// "26.05448", "2605448", "ar 26 05448" o "el 5448". Buscar eso como «contiene»
// en 25 años de pedidos tardaba de 5 a 12 s en RPS (09/11/2026), porque no
// puede usar el índice del código. Convertido a un código EXACTO (o a un
// principio de código) la misma consulta tarda 15 ms.
//
// Sin serie escrita se prueban las tres delegaciones (AR, SA, BE): el mismo
// número existe en las tres y antes solo se buscaba en Arzúa, así que los
// de Santiago y Bergondo no aparecían (17/11/2026). Arzúa sigue primero.
//
// Esto solo decide QUÉ buscar; la consulta la hace quien llama.

import { SERIES_PEDIDO } from "./types";

export type Busqueda =
  /** Códigos de pedido: exactos y/o por cómo empiezan («AR.26.054»). */
  | { tipo: "pedido"; exactos: string[]; prefijos: string[] }
  /** Número de OF: siete cifras empezando por 0 («0232470»). */
  | { tipo: "of"; codigo: string }
  /** Lo demás: nombre del cliente. */
  | { tipo: "texto"; texto: string };

/** Años hacia atrás que se prueban cuando solo se escribe el número («5448»):
 *  el de este año y los tres anteriores, de más nuevo a más viejo. */
const ANIOS_ATRAS = 3;

const relleno = (n: string) => n.padStart(5, "0");
const codigo = (serie: string, aa: string, n: string) => `${serie}.${aa}.${n}`;

/** La serie escrita, o las de todas las delegaciones si no se escribió. */
const series = (escrita?: string): readonly string[] => (escrita ? [escrita] : SERIES_PEDIDO);

/** Lo que el buscador ha de pedir a RPS para lo escrito. `anio` es el año en
 *  curso con cuatro cifras (se pasa para poder probarlo). */
export function interpretarBusqueda(escrito: string, anio: number): Busqueda {
  const limpio = escrito
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();

  // Con separador entre año y número: «26.05448», «AR.26.054», «ar 26 5448».
  const partes = limpio.match(/^(?:([A-Z]{2})[\s.\-]*)?(\d{2})[\s.\-]+(\d{1,5})$/);
  if (partes) {
    const [, serie, aa, n] = partes;
    const ss = series(serie);
    return n.length === 5
      ? { tipo: "pedido", exactos: ss.map((s) => codigo(s, aa, n)), prefijos: [] }
      // «26.5448»: puede ser el 05448 sin el cero o el principio de un 5448x.
      : {
          tipo: "pedido",
          exactos: ss.map((s) => codigo(s, aa, relleno(n))),
          prefijos: ss.map((s) => codigo(s, aa, n)),
        };
  }

  const pegado = limpio.replace(/[\s.\-]+/g, "");

  // Siete cifras con un 0 delante: una OF. Los pedidos con año 02 no existen.
  if (/^0\d{6}$/.test(pegado)) return { tipo: "of", codigo: pegado };

  // Con la serie delante y todo junto: «AR2605448», «AR26054», «AR26».
  const conSerie = pegado.match(/^([A-Z]{2})(\d{2})(\d{0,5})$/);
  if (conSerie) {
    const [, serie, aa, n] = conSerie;
    return n.length === 5
      ? { tipo: "pedido", exactos: [codigo(serie, aa, n)], prefijos: [] }
      : { tipo: "pedido", exactos: [], prefijos: [codigo(serie, aa, n)] };
  }

  // Año y número pegados: «2605448».
  const pegados = pegado.match(/^(\d{2})(\d{5})$/);
  if (pegados) {
    return { tipo: "pedido", exactos: series().map((s) => codigo(s, pegados[1], pegados[2])), prefijos: [] };
  }

  // Año y medio número: «260544», el principio de un AR.26.0544x.
  const medio = pegado.match(/^(\d{2})(\d{4})$/);
  if (medio) return { tipo: "pedido", exactos: [], prefijos: series().map((s) => codigo(s, medio[1], medio[2])) };

  // Solo el número: «5448», «05448». Ese número en los últimos años, en cada
  // delegación.
  if (/^\d{1,5}$/.test(pegado)) {
    const n = relleno(pegado);
    const exactos = series().flatMap((s) =>
      Array.from({ length: ANIOS_ATRAS + 1 }, (_, i) => codigo(s, String((anio - i) % 100).padStart(2, "0"), n)),
    );
    return { tipo: "pedido", exactos, prefijos: [] };
  }

  return { tipo: "texto", texto: escrito.trim() };
}

// ─── Acotar por fecha del pedido ─────────────────────────────────────────────
// Con varios resultados («carlos lopez» saca pedidos de años), Belén acota como
// hace en RPS con «Fecha pedido = Este mes» (18/11/2026). Va al servidor, no
// se filtra la lista ya traída: esa trae solo los 12 más nuevos y «Más
// antiguos» saldría siempre vacío.

export type RangoFecha = "todo" | "mes" | "trimestre" | "anio" | "antiguos";

export const RANGOS_FECHA: readonly { id: RangoFecha; rotulo: string }[] = [
  { id: "todo", rotulo: "Cualquier fecha" },
  { id: "mes", rotulo: "Último mes" },
  { id: "trimestre", rotulo: "Últimos 3 meses" },
  { id: "anio", rotulo: "Último año" },
  { id: "antiguos", rotulo: "Hace más de un año" },
];

export const esRangoFecha = (v: unknown): v is RangoFecha => RANGOS_FECHA.some((r) => r.id === v);

/** Los límites de fecha del pedido para un rango, contados hacia atrás desde
 *  `hoy`: `desde` incluido, `hasta` sin incluir. Sin límite, `null`. */
export function limitesRango(rango: RangoFecha, hoy: Date): { desde: Date | null; hasta: Date | null } {
  const atras = (meses: number) => new Date(hoy.getFullYear(), hoy.getMonth() - meses, hoy.getDate());
  switch (rango) {
    case "mes":
      return { desde: atras(1), hasta: null };
    case "trimestre":
      return { desde: atras(3), hasta: null };
    case "anio":
      return { desde: atras(12), hasta: null };
    case "antiguos":
      return { desde: null, hasta: atras(12) };
    default:
      return { desde: null, hasta: null };
  }
}
