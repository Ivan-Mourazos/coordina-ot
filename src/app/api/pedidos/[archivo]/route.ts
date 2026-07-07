import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// GET /api/pedidos/AR.26.02711.pdf — sirve el PDF escaneado del pedido desde
// el servidor de archivos (\\192.168.0.128\RPS\VENTAS\PEDIDOS\{año}\{codigo}.pdf,
// indexado también en GENEntityDocument). El servidor web necesita acceso de
// lectura al share. Si el fichero no existe se responde 404 y la tarjeta
// enseña la réplica dibujada.
//
// GET /api/pedidos/AR.26.02711.png — miniatura PNG (~420 px de ancho) de la
// 1ª página del mismo PDF, renderizada en el servidor con pdfjs-dist +
// @napi-rs/canvas y cacheada en disco (.next/cache/pedidos-thumbs). Pensada
// como imagen de las tarjetas del tablero: tras el primer render, cada
// petición se sirve directamente del fichero cacheado.

/** Solo códigos de pedido reales: nada de path traversal ni comodines. */
const ARCHIVO_RE = /^(AR\.(\d{2})\.\d{5})\.(pdf|png)$/i;

const RAIZ =
  process.env.RPS_PEDIDOS_PDF_DIR ?? "\\\\192.168.0.128\\RPS\\VENTAS\\PEDIDOS";

/** Carpeta de caché de miniaturas, dentro de la caché de Next. */
const CACHE_DIR = path.join(process.cwd(), ".next", "cache", "pedidos-thumbs");

/** Ancho de la miniatura en px (las tarjetas la muestran aún más pequeña). */
const ANCHO_MINIATURA = 420;

/** Renders simultáneos como máximo: 120 tarjetas no deben saturar la CPU. */
const MAX_RENDERS_SIMULTANEOS = 4;

const CABECERAS_PNG = {
  "Content-Type": "image/png",
  // La miniatura de un escaneo no cambia: cache larga en el navegador.
  "Cache-Control": "private, max-age=86400",
} as const;

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

// ---------------------------------------------------------------------------
// Render de la miniatura
// ---------------------------------------------------------------------------

/** Renders en vuelo por código: 120 tarjetas del mismo pedido = 1 render. */
const rendersEnVuelo = new Map<string, Promise<Buffer>>();

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
async function renderizarMiniatura(rutaPdf: string): Promise<Buffer> {
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

/**
 * Devuelve el PNG de la miniatura, desde la caché en disco si sigue vigente
 * (mtime >= mtime del PDF) o renderizándolo — una sola vez por código aunque
 * lleguen peticiones concurrentes.
 */
async function obtenerMiniatura(
  codigo: string,
  rutaPdf: string,
  mtimePdf: number,
): Promise<Buffer> {
  const rutaCache = path.join(CACHE_DIR, `${codigo}.png`);

  try {
    const infoCache = await stat(rutaCache);
    if (infoCache.mtimeMs >= mtimePdf) {
      return await readFile(rutaCache);
    }
  } catch {
    // Sin caché todavía: se renderiza abajo.
  }

  const enVuelo = rendersEnVuelo.get(codigo);
  if (enVuelo) return enVuelo;

  const render = conTurnoDeRender(async () => {
    const png = await renderizarMiniatura(rutaPdf);
    // Escritura atómica (tmp + rename) para que un lector concurrente nunca
    // vea un PNG a medias.
    await mkdir(CACHE_DIR, { recursive: true });
    const rutaTemporal = `${rutaCache}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(rutaTemporal, png);
    await rename(rutaTemporal, rutaCache);
    return png;
  }).finally(() => {
    rendersEnVuelo.delete(codigo);
  });

  rendersEnVuelo.set(codigo, render);
  return render;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ archivo: string }> },
) {
  const { archivo } = await params;
  const m = ARCHIVO_RE.exec(archivo);
  if (!m) {
    return new Response("Código de pedido no válido", { status: 400 });
  }

  // "AR.26.02711.pdf" → año 2026 (el 2º segmento del código es el año).
  const anho = 2000 + Number(m[2]);
  const codigo = m[1].toUpperCase();
  const extension = m[3].toLowerCase();
  const rutaPdf = `${RAIZ}\\${anho}\\${codigo}.pdf`;

  if (extension === "png") {
    let mtimePdf: number;
    try {
      mtimePdf = (await stat(rutaPdf)).mtimeMs;
    } catch {
      return new Response("PDF no encontrado", { status: 404 });
    }
    try {
      const png = await obtenerMiniatura(codigo, rutaPdf, mtimePdf);
      return new Response(new Uint8Array(png), { headers: CABECERAS_PNG });
    } catch (error) {
      console.error(`Miniatura de ${codigo} fallida:`, error);
      return new Response("No se pudo generar la miniatura", { status: 500 });
    }
  }

  try {
    const pdf = await readFile(rutaPdf);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${codigo}.pdf"`,
        // El escaneo de un pedido no cambia: cache larga en el navegador.
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new Response("PDF no encontrado", { status: 404 });
  }
}
