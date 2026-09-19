import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { crearCacheDocumentos } from "@/lib/visor-pdf";
import { cargarPdfJs, workerCompartido } from "./pdfjs-cliente";

/** Dónde están los recursos que pdf.js carga aparte. Los copia a `public/pdfjs/`
 *  `scripts/copiar-worker.mjs`, igual que el worker. Sin `wasmUrl`, los
 *  escaneos en JBIG2 salían en blanco: pdf.js no encontraba su decodificador y
 *  pintaba la página sin la imagen. Son los mismos que usa el servidor para
 *  las miniaturas (lib/server/miniaturas.ts). */
const RECURSOS_PDFJS = {
  wasmUrl: "/pdfjs/wasm/",
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  iccUrl: "/pdfjs/iccs/",
};

/** Cinco: el que se ve, sus dos vecinos precargados y dos para volver atrás. */
const TOPE_DOCUMENTOS = 5;

/** Lo que guarda la caché: el documento y cómo cerrarlo. En pdf.js 6 quien
 *  cierra es la tarea de carga, no el documento. */
interface Abierto {
  doc: PDFDocumentProxy;
  destroy(): Promise<void>;
}

// SIN RANGE Y SIN STREAM. Las rutas que sirven el PDF no entienden `Range`:
// pdf.js haría una petición de sondeo para nada. Pedido entero en un GET
// normal, la caché del navegador (Cache-Control de 24 h, ya puesto en las
// rutas) lo sirve de disco la segunda vez.
const cache = crearCacheDocumentos<Abierto>(async (url) => {
  const [pdfjs, worker] = await Promise.all([cargarPdfJs(), workerCompartido()]);
  const tarea = pdfjs.getDocument({ url, worker, disableRange: true, disableStream: true, ...RECURSOS_PDFJS });
  const doc = await tarea.promise;
  return { doc, destroy: () => tarea.destroy() };
}, TOPE_DOCUMENTOS);

/** Lo deja abierto sin enseñarlo: para el siguiente de la lista. No lo fija:
 *  una precarga que nadie llega a mirar es lo primero que debe salir. */
export function precargarPdf(url: string): void {
  cache.obtener(url).catch(() => {});
}

interface Estado {
  url: string;
  doc: PDFDocumentProxy | null;
  error: boolean;
}

/** El documento de `url`, o null mientras carga. Al cambiar de url se ve
 *  vacío al momento (no el documento anterior): la comparación de `url` de
 *  abajo lo resuelve sin un setState dentro del efecto. */
export function usePdfDoc(url: string): { doc: PDFDocumentProxy | null; error: boolean } {
  const [estado, setEstado] = useState<Estado>({ url, doc: null, error: false });
  useEffect(() => {
    let vivo = true;
    // Fijado ANTES de pedirlo: mientras se vea no lo puede cerrar la caché,
    // aunque el otro visor del cajón pase por cinco documentos más.
    const soltar = cache.fijar(url);
    cache.obtener(url).then(
      ({ doc }) => {
        if (vivo) setEstado({ url, doc, error: false });
      },
      () => {
        if (vivo) setEstado({ url, doc: null, error: true });
      },
    );
    return () => {
      vivo = false;
      soltar();
    };
  }, [url]);
  return estado.url === url ? estado : { doc: null, error: false };
}
