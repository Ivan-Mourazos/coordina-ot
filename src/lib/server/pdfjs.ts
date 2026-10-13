import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ─── pdfjs en Node, una sola vez ─────────────────────────────────────────────
// Se carga en tiempo de ejecución desde su build `legacy` y no con un import
// normal: el empaquetador de Next no sabe con él (ver el comentario de
// miniaturas.ts). Lo usan las miniaturas y la lectura de planteamientos.

export type ModuloPdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let promesa: Promise<{ pdfjs: ModuloPdfJs; pdfjsDir: string }> | null = null;

export function cargarPdfjs() {
  promesa ??= (async () => {
    const require = createRequire(path.join(process.cwd(), "package.json"));
    const pdfjsDir = path.dirname(require.resolve("pdfjs-dist/package.json")).replace(/\\/g, "/");
    const pdfjs: ModuloPdfJs = await import(
      /* webpackIgnore: true */
      pathToFileURL(`${pdfjsDir}/legacy/build/pdf.mjs`).href
    );
    return { pdfjs, pdfjsDir };
  })();
  return promesa;
}
