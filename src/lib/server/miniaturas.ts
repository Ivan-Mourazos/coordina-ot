import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ─── Miniaturas de ficheros del share de RPS ─────────────────────────────────
// Dibuja en pequeño la 1ª página de un PDF y encoge una foto, y guarda el
// resultado en disco para no repetir el trabajo.
//
// Estaba todo dentro de /api/pedidos/[archivo] (la miniatura del parte que
// sale en las tarjetas del tablero). Se saca aquí porque ahora hay un segundo
// cliente: los documentos del pedido —planteamientos, presupuestos, fotos de
// mantenimiento— que también se enseñan en rejilla. Dos copias del motor se
// habrían separado a la primera corrección de un escaneo que sale en blanco.
//
// POR QUÉ ENCOGER LAS FOTOS Y NO SERVIRLAS TAL CUAL. Las fotos que sube el SAT
// vienen del móvil: 3 MB cada una. Un pedido con seis son 18 MB para pintar
// seis cuadraditos de 90 px, y mientras llegan la rejilla se ve negra. La
// miniatura ronda los 30 KB.

/** Ancho de la miniatura en px. Las tarjetas y las rejillas la enseñan aún más
 *  pequeña; sobra para que se lea de qué va el papel. */
export const ANCHO_MINIATURA = 420;

/** Renders simultáneos como máximo: 120 tarjetas no deben saturar la CPU. */
const MAX_RENDERS_SIMULTANEOS = 4;

// ---------------------------------------------------------------------------
// Carga en runtime de pdfjs-dist y @napi-rs/canvas.
//
// Ninguno de los dos está en la lista de serverExternalPackages de Next, y
// empaquetarlos con Turbopack rompe cosas: el "fake worker" de pdf.js hace
// imports dinámicos relativos a su propio fichero y @napi-rs/canvas carga un
// binario .node. Importándolos en runtime desde node_modules (resueltos desde
// la raíz del proyecto) quedan fuera del bundle y funcionan tal cual.
// ---------------------------------------------------------------------------

type ModuloPdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type ModuloCanvas = typeof import("@napi-rs/canvas");

let motorPromise: Promise<{
  pdfjs: ModuloPdfJs;
  canvas: ModuloCanvas;
  /** Raíz de pdfjs-dist en disco, para cmaps/fuentes/wasm (JBIG2, JPX…). */
  pdfjsDir: string;
}> | null = null;

function cargarMotor() {
  motorPromise ??= (async () => {
    const require = createRequire(path.join(process.cwd(), "package.json"));
    const pdfjsDir = path
      .dirname(require.resolve("pdfjs-dist/package.json"))
      .replace(/\\/g, "/");
    const pdfjs: ModuloPdfJs = await import(
      /* webpackIgnore: true */
      pathToFileURL(`${pdfjsDir}/legacy/build/pdf.mjs`).href
    );
    const canvas: ModuloCanvas = require("@napi-rs/canvas");
    return { pdfjs, canvas, pdfjsDir };
  })();
  return motorPromise;
}

let rendersActivos = 0;
const colaDeTurnos: Array<() => void> = [];

/** Limita cuántos renders corren a la vez; el resto espera su turno. */
async function conTurnoDeRender<T>(fn: () => Promise<T>): Promise<T> {
  if (rendersActivos >= MAX_RENDERS_SIMULTANEOS) {
    await new Promise<void>((resolve) => colaDeTurnos.push(resolve));
  }
  rendersActivos += 1;
  try {
    return await fn();
  } finally {
    rendersActivos -= 1;
    colaDeTurnos.shift()?.();
  }
}

/** Renderiza la 1ª página del PDF a PNG de ANCHO_MINIATURA px de ancho. */
export async function renderizarPdf(rutaPdf: string): Promise<Buffer> {
  const { pdfjs, canvas, pdfjsDir } = await cargarMotor();
  const data = new Uint8Array(await readFile(rutaPdf));

  const tarea = pdfjs.getDocument({
    data,
    // Recursos auxiliares desde el paquete: sin el wasm, los escaneos JBIG2
    // (el formato habitual de estos PDF) salen en blanco.
    cMapUrl: `${pdfjsDir}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${pdfjsDir}/standard_fonts/`,
    wasmUrl: `${pdfjsDir}/wasm/`,
    iccUrl: `${pdfjsDir}/iccs/`,
  });
  try {
    const documento = await tarea.promise;
    const pagina = await documento.getPage(1);
    const escala = ANCHO_MINIATURA / pagina.getViewport({ scale: 1 }).width;
    const viewport = pagina.getViewport({ scale: escala });
    const lienzo = canvas.createCanvas(
      Math.round(viewport.width),
      Math.round(viewport.height),
    );
    await pagina.render({
      // El canvas de @napi-rs no es un HTMLCanvasElement, pero pdf.js lo
      // acepta (lo usa él mismo en Node); el cast salva solo el tipado DOM.
      canvasContext: lienzo.getContext("2d") as unknown as CanvasRenderingContext2D,
      canvas: lienzo as unknown as HTMLCanvasElement,
      viewport,
    }).promise;
    return lienzo.toBuffer("image/png");
  } finally {
    await tarea.destroy();
  }
}

/** Encoge una imagen del share a ANCHO_MINIATURA px de ancho, en JPEG.
 *
 *  JPEG y no PNG a propósito: son fotos, y el PNG de una foto de móvil pesa
 *  más que el original. Si ya viene más estrecha que la miniatura se deja
 *  como está (no se agranda: quedaría borrosa y ocuparía más).
 *
 *  Lanza si el formato no lo entiende el decodificador — los `.tif` del share
 *  entran por aquí y no todos salen. Quien llama lo trata como "sin
 *  miniatura", no como un error de la web. */
export async function redimensionarImagen(rutaImagen: string): Promise<Buffer> {
  const { canvas } = await cargarMotor();
  const imagen = await canvas.loadImage(await readFile(rutaImagen));
  const escala = Math.min(1, ANCHO_MINIATURA / imagen.width);
  const lienzo = canvas.createCanvas(
    Math.max(1, Math.round(imagen.width * escala)),
    Math.max(1, Math.round(imagen.height * escala)),
  );
  const ctx = lienzo.getContext("2d");
  ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  return lienzo.toBuffer("image/jpeg", 78);
}

/** Peticiones de la misma miniatura que ya están en marcha: 120 tarjetas del
 *  mismo pedido = un solo render. La clave es la del fichero de caché. */
const rendersEnVuelo = new Map<string, Promise<Buffer>>();

/**
 * La miniatura de `clave`, desde la caché en disco si sigue vigente (mtime del
 * fichero cacheado >= mtime del original) o generándola con `generar` — una
 * sola vez aunque lleguen peticiones concurrentes.
 *
 * `carpeta` es el directorio de caché y `clave` el nombre del fichero: quien
 * llama decide dónde guarda lo suyo (los partes y los documentos no comparten
 * espacio de nombres).
 */
export async function miniaturaCacheada(
  carpeta: string,
  clave: string,
  mtimeOriginal: number,
  generar: () => Promise<Buffer>,
): Promise<Buffer> {
  const rutaCache = path.join(carpeta, clave);

  try {
    const infoCache = await stat(rutaCache);
    if (infoCache.mtimeMs >= mtimeOriginal) {
      return await readFile(rutaCache);
    }
  } catch {
    // Sin caché todavía: se genera abajo.
  }

  const enVuelo = rendersEnVuelo.get(rutaCache);
  if (enVuelo) return enVuelo;

  const render = conTurnoDeRender(async () => {
    const bytes = await generar();
    // Escritura atómica (tmp + rename) para que un lector concurrente nunca
    // vea un fichero a medias.
    await mkdir(carpeta, { recursive: true });
    const rutaTemporal = `${rutaCache}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(rutaTemporal, bytes);
    await rename(rutaTemporal, rutaCache);
    return bytes;
  }).finally(() => {
    rendersEnVuelo.delete(rutaCache);
  });

  rendersEnVuelo.set(rutaCache, render);
  return render;
}
