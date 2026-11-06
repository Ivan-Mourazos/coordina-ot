import { createHash } from "node:crypto";
import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { esCodigoPedido } from "../types";

export interface ConfigCad {
  roots: string[];
  clientRoots: string[];
  urlTemplate: string;
}

export interface DwgPedido {
  id: string;
  nombre: string;
  subcarpeta: string;
  modificado: string;
  url: string;
}

const PLANTILLA = "tgm-pedidos://open?kind={kind}&path={path}";
const CACHE_MS = 5 * 60 * 1000;
const lista = (valor?: string) => (valor ?? "").split(";").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
const esWindows = (ruta: string) => ruta.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(ruta);
const tienePadre = (ruta: string) => ruta.split(/[\\/]/).includes("..");
const dentro = (raiz: string, ruta: string) => {
  const relativa = path.relative(raiz, ruta);
  return !tienePadre(relativa) && !path.isAbsolute(relativa);
};
const noExiste = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

export function configCad(env: Record<string, string | undefined> = process.env): ConfigCad {
  return {
    roots: lista(env.CAD_DWG_ROOTS),
    clientRoots: lista(env.CAD_CLIENT_ROOTS),
    urlTemplate: env.CAD_OPEN_URL_TEMPLATE?.trim() || PLANTILLA,
  };
}

export function compactoPedido(pedido: string): string {
  if (!esCodigoPedido(pedido)) throw new Error("Pedido no válido");
  return pedido.replaceAll(".", "");
}

/** Misma traducción y codificación que client-open.ts del Historial: cada
 *  raíz del servidor corresponde a la raíz Windows de su misma posición. */
export function traducirRutaCad(ruta: string, config: ConfigCad): string {
  if (tienePadre(ruta)) throw new Error("Ruta CAD no permitida");
  // Una raíz más específica puede estar dentro de otra configurada.
  const raices = [...config.roots.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [i, raiz] of raices) {
    const sistema = esWindows(raiz) ? path.win32 : path.posix;
    const relativa = sistema.relative(raiz, ruta);
    if (tienePadre(relativa) || sistema.isAbsolute(relativa)) continue;
    const cliente = config.clientRoots[i] ?? (esWindows(raiz) ? raiz : undefined);
    if (!cliente || !path.win32.isAbsolute(cliente) || tienePadre(cliente)) {
      throw new Error("Falta configurar CAD_CLIENT_ROOTS con las rutas Windows de Oficina Técnica");
    }
    return path.win32.join(cliente, ...relativa.split(/[\\/]/));
  }
  throw new Error("Ruta CAD fuera de las raíces configuradas");
}

export function enlaceCad(ruta: string, config: ConfigCad): string {
  return config.urlTemplate.replaceAll("{kind}", "cad").replaceAll("{path}", encodeURIComponent(traducirRutaCad(ruta, config)));
}

/** Solo se indexan nombres DWG del año solicitado. Las promesas compartidas
 *  evitan recorridos duplicados cuando varias fichas se abren a la vez.
 *  No se siguen enlaces simbólicos ni junctions fuera del árbol permitido. */
export function crearBuscadorCad(config: ConfigCad, ahora = Date.now) {
  const cache = new Map<string, { vence: number; listado: Promise<string[]> }>();
  if (config.clientRoots.length && config.clientRoots.length !== config.roots.length) {
    throw new Error("CAD_DWG_ROOTS y CAD_CLIENT_ROOTS deben tener el mismo número de raíces");
  }
  if (config.roots.some((r) => !path.isAbsolute(r) || tienePadre(r))) {
    throw new Error("CAD_DWG_ROOTS debe contener rutas absolutas sin '..'");
  }
  if (!config.urlTemplate.startsWith("tgm-pedidos://") || !config.urlTemplate.includes("{path}")) {
    throw new Error("CAD_OPEN_URL_TEMPLATE debe usar tgm-pedidos y contener {path}");
  }

  async function recorrer(carpeta: string, raiz: string, recursivo: boolean): Promise<string[]> {
    try {
      // La raíz configurada puede ser un montaje/enlace; los hijos no.
      const limite = await realpath(raiz);
      const inicio = await realpath(carpeta);
      if (!dentro(limite, inicio)) return [];
      const pendientes = [carpeta];
      const ficheros: string[] = [];
      while (pendientes.length) {
        const actual = pendientes.pop()!;
        if (!dentro(inicio, await realpath(actual))) continue;
        for (const entrada of await readdir(actual, { withFileTypes: true })) {
          if (/^[~.]/.test(entrada.name)) continue;
          const ruta = path.join(actual, entrada.name);
          if (entrada.isDirectory() && recursivo && !entrada.isSymbolicLink()) pendientes.push(ruta);
          else if (entrada.isFile() && path.extname(entrada.name).toLowerCase() === ".dwg") ficheros.push(ruta);
        }
      }
      return ficheros;
    } catch (error) {
      if (noExiste(error)) return [];
      throw error;
    }
  }

  function indice(raiz: string, anio?: string) {
    const carpeta = anio ? path.join(raiz, anio) : raiz;
    const clave = JSON.stringify([raiz, anio]);
    const anterior = cache.get(clave);
    if (anterior && anterior.vence > ahora()) return anterior.listado;
    // Tope de memoria para servidores que consultan muchos años distintos.
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    const entrada = { vence: Infinity, listado: recorrer(carpeta, raiz, !!anio) };
    cache.set(clave, entrada);
    entrada.listado.then(() => { entrada.vence = ahora() + CACHE_MS; }, () => { cache.delete(clave); });
    return entrada.listado;
  }

  async function listar(pedido: string): Promise<DwgPedido[]> {
    const compacto = compactoPedido(pedido).toLowerCase();
    const anio = `20${pedido.split(".")[1]}`;
    const coincide = (ruta: string) => path.basename(ruta).toLowerCase().startsWith(compacto);
    let grupos = await Promise.all(config.roots.map(async (raiz) => ({ raiz, rutas: (await indice(raiz, anio)).filter(coincide) })));
    if (!grupos.some((g) => g.rutas.length)) {
      grupos = await Promise.all(config.roots.map(async (raiz) => ({ raiz, rutas: (await indice(raiz)).filter(coincide) })));
    }
    const resultado: DwgPedido[] = [];
    for (const { raiz, rutas } of grupos) {
      const limite = await realpath(raiz).catch((error) => { if (noExiste(error)) return null; throw error; });
      if (!limite) continue;
      for (const ruta of rutas) {
        try {
          // Se comprueba de nuevo incluso con índice caliente: no abrir algo
          // borrado o sustituido por un enlace desde que se llenó la caché.
          if (!dentro(limite, await realpath(ruta))) continue;
          const info = await lstat(ruta);
          if (!info.isFile() || info.isSymbolicLink()) continue;
          resultado.push({
            id: createHash("sha256").update(ruta).digest("hex"),
            nombre: path.basename(ruta),
            subcarpeta: path.relative(raiz, path.dirname(ruta)).split(path.sep).join("/") || "Raíz de Oficina Técnica",
            modificado: info.mtime.toISOString(),
            url: enlaceCad(ruta, config),
          });
        } catch (error) {
          if (!noExiste(error)) throw error;
        }
      }
    }
    return resultado.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }) || a.subcarpeta.localeCompare(b.subcarpeta));
  }

  async function elegir(pedido: string, id: string) {
    // El cliente solo manda un ID opaco: nunca se concatena a ninguna ruta.
    return (await listar(pedido)).find((dwg) => dwg.id === id) ?? null;
  }
  return { listar, elegir };
}

let buscador: { clave: string; valor: ReturnType<typeof crearBuscadorCad> } | undefined;
export function buscadorCad() {
  const config = configCad();
  const clave = JSON.stringify(config);
  if (!buscador || buscador.clave !== clave) buscador = { clave, valor: crearBuscadorCad(config) };
  return buscador.valor;
}
