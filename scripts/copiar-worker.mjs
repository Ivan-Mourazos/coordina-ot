// Copia el worker de pdf.js a public/, que es desde donde lo pide el visor
// (/pdf.worker.mjs). Por script y no a mano: así la versión del worker va
// siempre con la del paquete, y una actualización de pdfjs-dist no deja un
// worker viejo hablando con una librería nueva — eso falla sin error claro.
//
// No se commitea (.gitignore): se genera en cada `pnpm dev` y `pnpm build`.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const raiz = path.dirname(require.resolve("pdfjs-dist/package.json"));
const origen = path.join(raiz, "build", "pdf.worker.min.mjs");
const destino = path.join(process.cwd(), "public", "pdf.worker.mjs");

mkdirSync(path.dirname(destino), { recursive: true });
copyFileSync(origen, destino);
console.log(`pdf.worker → ${path.relative(process.cwd(), destino)}`);
