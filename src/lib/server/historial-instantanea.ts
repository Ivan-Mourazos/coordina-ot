import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import type { BaseHistorial, IndiceHistorial, InfoPedidoHistorial } from "../historial-indice";
import type { SeccionId } from "../secciones";

// ─── La lista del Historial, guardada en disco ───────────────────────────────
// La lista en memoria (historial-indice.ts) cuesta minutos de RPS y se perdía
// en cada reinicio: después de cada actualización de la web, el Historial, el
// buscador y la consulta pública se quedaban sin ella hasta que se rehacía, y
// mientras tanto caían a la consulta directa, que no llega antes de que corte
// el proxy. Medido el 16/11/2026 (ver scripts/medir-arranque.test.ts).
//
// Aquí se guarda al terminar cada construcción y se recupera al arrancar: el
// reinicio deja de notarse. Lo recuperado es tan viejo como la última
// construcción (media hora como mucho con el servidor en marcha), que es lo
// mismo que ya se servía un minuto antes de reiniciar.
//
// FORMATO: una línea de JSON por dato, comprimido. Línea a línea y no un JSON
// entero porque la lista son más de 100 MB en memoria: montar el texto completo
// para escribirlo, o leerlo entero para interpretarlo, duplicaría eso de golpe
// con un límite de PM2 de 1 GB.
//
//   {"v":1,"at":…,"secciones":[…]}        cabecera
//   ["b", sección, pedido, …]              una fila de `base`
//   ["i", pedido, cliente, …]              una entrada de `info`
//   ["p", pedido, [empleados]]             una entrada de `personas`
//   ["fin", n]                             cuántas líneas de datos van
//
// La última línea da fe de que el fichero se escribió entero. Además se
// escribe en un temporal y se renombra, así que un corte a medias deja la
// instantánea anterior intacta.

/** Si cambia lo que se guarda de cada pedido, se sube: una instantánea con
 *  otro número se ignora y la lista se construye de nuevo. */
const VERSION = 1;

/** Junto a la base de datos local (`data/`), que ya es la carpeta que el
 *  servidor puede escribir y que no se versiona. */
export function rutaInstantanea(): string {
  const carpeta = process.env.COORDINA_DB_PATH
    ? path.dirname(process.env.COORDINA_DB_PATH)
    : path.join(process.cwd(), "data");
  return path.join(carpeta, "cache", "historial-lista.ndjson.gz");
}

function* lineasDe(indice: IndiceHistorial): Generator<string> {
  const secciones = Object.keys(indice.base) as SeccionId[];
  yield JSON.stringify({ v: VERSION, at: indice.at, secciones });
  let n = 0;
  for (const s of secciones) {
    for (const b of indice.base[s]) {
      n++;
      yield JSON.stringify(["b", s, b.pedido, b.fechaPedido, b.nOf, b.fechaEntrega, +b.pendienteEntrega,
        +b.trabajoAbierto, b.fechaEntregado, +b.tieneSeccion, +b.pendienteSeccion, +b.pendienteTotal, b.finalizada]);
    }
  }
  for (const [pedido, i] of indice.info) {
    n++;
    yield JSON.stringify(["i", pedido, i.cliente, i.negocio, i.ciudadEntrega, i.familias, i.ordenes, i.textos]);
  }
  for (const [pedido, quienes] of indice.personas) {
    n++;
    yield JSON.stringify(["p", pedido, [...quienes]]);
  }
  yield JSON.stringify(["fin", n]);
}

/** Las líneas en trozos de unos 64 KB, soltando el hilo entre uno y otro: son
 *  más de medio millón de líneas y el servidor tiene que seguir contestando
 *  mientras se escriben. */
async function* trozosDe(indice: IndiceHistorial): AsyncGenerator<string> {
  let trozo = "";
  for (const linea of lineasDe(indice)) {
    trozo += `${linea}\n`;
    if (trozo.length < 65_536) continue;
    yield trozo;
    trozo = "";
    await new Promise((seguir) => setImmediate(seguir));
  }
  if (trozo) yield trozo;
}

export async function guardarInstantanea(indice: IndiceHistorial, ruta: string): Promise<void> {
  await mkdir(path.dirname(ruta), { recursive: true });
  const temporal = `${ruta}.tmp`;
  try {
    // Nivel 1: el texto se repite mucho y comprime bien igual, y así cuesta
    // la mitad de CPU que el nivel por defecto.
    await pipeline(Readable.from(trozosDe(indice)), createGzip({ level: 1 }), createWriteStream(temporal));
    await rename(temporal, ruta);
  } catch (e) {
    await rm(temporal, { force: true }).catch(() => {});
    throw e;
  }
}

/** Una sola copia de cada texto repetido (ver `compartidor` en
 *  historial-indice.ts): al leer, cada línea trae su propia copia. */
function compartidor() {
  const vistos = new Map<string, string>();
  return (s: string): string => {
    const ya = vistos.get(s);
    if (ya !== undefined) return ya;
    vistos.set(s, s);
    return s;
  };
}

const siHay = (v: unknown, comparte: (s: string) => string): string | null =>
  typeof v === "string" ? comparte(v) : null;
const numero = (v: unknown): number | null => (typeof v === "number" ? v : null);

export interface CuandoVale {
  /** Las secciones de hoy: una instantánea con otras no vale. */
  secciones: readonly SeccionId[];
  /** Más vieja que esto no se sirve: el servidor estuvo parado y diría lo de
   *  entonces como si fuera de ahora. */
  maxEdadMs: number;
}

/** La lista guardada, o null si no hay, no se puede leer, está a medias, es de
 *  otra versión o de otras secciones, o es demasiado vieja. Nunca revienta:
 *  sin instantánea se construye la lista como siempre. */
export async function leerInstantanea(ruta: string, vale: CuandoVale): Promise<IndiceHistorial | null> {
  const origen = createReadStream(ruta);
  const texto = createGunzip();
  texto.setEncoding("utf8");
  origen.on("error", (e) => texto.destroy(e));
  origen.pipe(texto);
  try {
    const comparte = compartidor();
    const base = {} as Record<SeccionId, BaseHistorial[]>;
    const info = new Map<string, InfoPedidoHistorial>();
    const personas = new Map<string, Set<string>>();
    let at: number | null = null;
    let leidas = 0;
    let completa = false;

    const interpretar = (linea: string): boolean => {
      const dato = JSON.parse(linea) as unknown;
      if (at === null) {
        const c = dato as { v?: unknown; at?: unknown; secciones?: unknown };
        if (c?.v !== VERSION || typeof c.at !== "number" || !Array.isArray(c.secciones)) return false;
        const edad = Date.now() - c.at;
        if (edad < 0 || edad > vale.maxEdadMs) return false;
        const guardadas = new Set(c.secciones as string[]);
        if (guardadas.size !== vale.secciones.length || !vale.secciones.every((s) => guardadas.has(s))) return false;
        for (const s of vale.secciones) base[s] = [];
        at = c.at;
        return true;
      }
      if (!Array.isArray(dato) || completa) return false;
      const d = dato as unknown[];
      if (d[0] === "fin") {
        completa = d[1] === leidas;
        return completa;
      }
      leidas++;
      if (d[0] === "b") {
        const filas = base[d[1] as SeccionId];
        if (!filas || typeof d[2] !== "string") return false;
        filas.push({
          pedido: comparte(d[2]),
          fechaPedido: numero(d[3]),
          nOf: numero(d[4]) ?? 0,
          fechaEntrega: numero(d[5]),
          pendienteEntrega: d[6] === 1,
          trabajoAbierto: d[7] === 1,
          fechaEntregado: numero(d[8]),
          tieneSeccion: d[9] === 1,
          pendienteSeccion: d[10] === 1,
          pendienteTotal: d[11] === 1,
          finalizada: numero(d[12]),
        });
        return true;
      }
      if (d[0] === "i") {
        if (typeof d[1] !== "string" || !Array.isArray(d[5])) return false;
        info.set(comparte(d[1]), {
          cliente: siHay(d[2], comparte),
          negocio: siHay(d[3], comparte),
          ciudadEntrega: siHay(d[4], comparte),
          familias: (d[5] as string[]).map(comparte),
          ordenes: typeof d[6] === "string" ? d[6] : "",
          textos: typeof d[7] === "string" ? d[7] : "",
        });
        return true;
      }
      if (d[0] === "p") {
        if (typeof d[1] !== "string" || !Array.isArray(d[2])) return false;
        personas.set(comparte(d[1]), new Set((d[2] as string[]).map(comparte)));
        return true;
      }
      return false;
    };

    let resto = "";
    for await (const trozo of texto as AsyncIterable<string>) {
      const lineas = (resto + trozo).split("\n");
      resto = lineas.pop() ?? "";
      for (const linea of lineas) {
        if (linea && !interpretar(linea)) return null;
      }
    }
    if (resto && !interpretar(resto)) return null;
    return at !== null && completa ? { at, base, info, personas } : null;
  } catch (e) {
    // Sin fichero es lo normal en el primer arranque: no se avisa.
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[historial] la lista guardada en disco no se pudo leer:", (e as Error).message);
    }
    return null;
  } finally {
    origen.destroy();
    texto.destroy();
  }
}
