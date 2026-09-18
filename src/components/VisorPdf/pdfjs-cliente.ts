import type { PDFWorker } from "pdfjs-dist";

// ─── pdf.js en el navegador ──────────────────────────────────────────────────
// Se carga con import() la primera vez que se abre un visor, no con el
// tablero: son cientos de KB que la mayoría de visitas no necesita.
//
// Un solo worker para todos los documentos. Por defecto pdf.js levanta uno por
// documento, y pasando planteamientos con las flechas serían arranques de
// worker en cadena. Al que se le pasa un worker de fuera, pdf.js no lo destruye
// al cerrar el documento: vive lo que vive la pestaña.

type PdfJs = typeof import("pdfjs-dist");

/** Lo copia scripts/copiar-worker.mjs. */
export const RUTA_WORKER = "/pdf.worker.mjs";

let modulo: Promise<PdfJs> | null = null;
let worker: PDFWorker | null = null;

export function cargarPdfJs(): Promise<PdfJs> {
  modulo ??= import("pdfjs-dist")
    .then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = RUTA_WORKER;
      return pdfjs;
    })
    .catch((e) => {
      // Que un fallo de red al cargarlo no deje el visor muerto hasta recargar.
      modulo = null;
      throw e;
    });
  return modulo;
}

export async function workerCompartido(): Promise<PDFWorker> {
  const pdfjs = await cargarPdfJs();
  if (!worker) {
    const creado = new pdfjs.PDFWorker();
    worker = creado;
    // Un worker que no arranca no se queda para siempre: el siguiente
    // documento que se abra lo vuelve a intentar.
    creado.promise.catch(() => {
      if (worker === creado) worker = null;
    });
  }
  return worker;
}
