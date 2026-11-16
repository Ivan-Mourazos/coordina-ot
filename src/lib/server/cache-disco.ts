import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";

// ─── Lo que Métricas guarda de RPS, también en disco ─────────────────────────
// Las no conformidades del año y las OF pasadas en RPS antes de Coordina se
// guardaban solo en memoria, y cada actualización de la web es un reinicio: el
// primero que abría Métricas después esperaba las consultas enteras, que recién
// arrancado el servidor llegaban a 20 s y 48 s (log de producción, 16/11/2026).
//
// Lo mismo que la lista del Historial (historial-instantanea.ts), en pequeño:
// cada consulta que llega se deja en disco, y la PRIMERA vez que se pide algo
// tras arrancar se sirve lo del disco mientras RPS contesta por detrás. Lo
// servido así es de la última vez que se pidió (como mucho `maxEdadMs`); quien
// vuelva a abrir la pantalla cuando llegue RPS ya ve lo nuevo.
//
// Solo en el servidor de verdad (ver `activarCacheEnDisco`): los tests y los
// scripts ni leen ni dejan ficheros.

declare global {
  var __coordinaCacheEnDisco: boolean | undefined;
}

/** Lo llama el arranque del servidor (metricas-precalentar.ts). */
export function activarCacheEnDisco(): void {
  globalThis.__coordinaCacheEnDisco = true;
}

/** Si cambia la forma de lo guardado, se sube: lo de otra versión se ignora. */
const VERSION = 1;

const comprimir = promisify(gzip);
const descomprimir = promisify(gunzip);

/** En `data/cache`, junto a la base local y la lista del Historial. */
export function rutaCacheDisco(nombre: string): string {
  const carpeta = process.env.COORDINA_DB_PATH
    ? path.dirname(process.env.COORDINA_DB_PATH)
    : path.join(process.cwd(), "data");
  return path.join(carpeta, "cache", `${nombre}.json.gz`);
}

interface Guardado<T> { v: number; at: number; clave: string; datos: T }

async function leerDelDisco<T>(nombre: string, clave: string, maxEdadMs: number): Promise<Guardado<T> | null> {
  try {
    const texto = await descomprimir(await readFile(rutaCacheDisco(nombre)));
    const g = JSON.parse(texto.toString("utf8")) as Guardado<T>;
    const edad = Date.now() - g.at;
    if (g.v !== VERSION || g.clave !== clave || !(edad >= 0 && edad <= maxEdadMs)) return null;
    return g;
  } catch (e) {
    // Sin fichero es lo normal la primera vez: no se avisa.
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[cache] ${nombre}: lo guardado en disco no se pudo leer:`, (e as Error).message);
    }
    return null;
  }
}

async function guardarEnDisco<T>(nombre: string, clave: string, datos: T): Promise<void> {
  const ruta = rutaCacheDisco(nombre);
  const temporal = `${ruta}.tmp`;
  try {
    await mkdir(path.dirname(ruta), { recursive: true });
    const g: Guardado<T> = { v: VERSION, at: Date.now(), clave, datos };
    await writeFile(temporal, await comprimir(JSON.stringify(g)));
    // Escrito aparte y renombrado: un corte a medias deja intacto lo anterior.
    await rename(temporal, ruta);
  } catch (e) {
    await rm(temporal, { force: true }).catch(() => {});
    console.warn(`[cache] ${nombre}: no se pudo guardar en disco:`, (e as Error).message);
  }
}

export interface ConDisco {
  /** Lo guardado en disco vale si se guardó con esta misma clave. Puede ser
   *  más gruesa que la de memoria: las NC del año cambian de clave cada día
   *  (acaban hoy), y lo de ayer sirve igual mientras llega lo de hoy. */
  clave: string;
  /** Más viejo que esto no se sirve. */
  maxEdadMs: number;
  /** Quien necesite lo de RPS de verdad (el precalentado, que lo cronometra y
   *  no quiere lanzar dos consultas a la vez) lo espera; lo del disco queda
   *  igualmente para los demás. */
  esperarRps?: boolean;
}

/** Una caché en memoria por clave, con la consulta en curso guardada para que
 *  dos que piden lo mismo se enganchen a ella, y respaldo en disco opcional. */
export function cacheConDisco<T>(nombre: string, vigenciaMs: number) {
  const memoria = new Map<string, { hasta: number; filas: Promise<T> }>();
  return function pedir(clave: string, consultar: () => Promise<T>, disco?: ConDisco): Promise<T> {
    const ya = memoria.get(clave);
    if (ya && ya.hasta > Date.now()) return ya.filas;
    const consulta = consultar();
    const entrada = { hasta: Date.now() + vigenciaMs, filas: consulta };
    memoria.set(clave, entrada);
    const conDisco = disco && globalThis.__coordinaCacheEnDisco ? disco : null;
    consulta.then(
      (datos) => {
        if (memoria.get(clave) !== entrada) return;
        entrada.filas = consulta;
        entrada.hasta = Date.now() + vigenciaMs;
        if (conDisco) void guardarEnDisco(nombre, conDisco.clave, datos);
      },
      () => { if (memoria.get(clave) === entrada) memoria.delete(clave); },
    );
    // Solo la primera vez desde que arrancó (o tras un fallo): lo caducado en
    // memoria se espera como siempre, que el servidor ya lleva rato en marcha.
    if (!conDisco || ya) return consulta;
    const t0 = Date.now();
    entrada.filas = leerDelDisco<T>(nombre, conDisco.clave, conDisco.maxEdadMs).then((g) => {
      if (!g) return consulta;
      const minutos = Math.round((Date.now() - g.at) / 60_000);
      console.info(`[cache] ${nombre}: servido del disco en ${Date.now() - t0} ms (de hace ${minutos} min) mientras contesta RPS`);
      return g.datos;
    });
    // Sin disco recae en la consulta: si falla y nadie esperaba esta promesa
    // (el precalentado espera la consulta), que no quede un rechazo suelto.
    entrada.filas.catch(() => {});
    return conDisco.esperarRps ? consulta : entrada.filas;
  };
}
