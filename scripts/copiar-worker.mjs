// Copia el worker de pdf.js a public/, que es desde donde lo pide el visor
// (/pdf.worker.mjs). Por script y no a mano: así la versión del worker va
// siempre con la del paquete, y una actualización de pdfjs-dist no deja un
// worker viejo hablando con una librería nueva — eso falla sin error claro.
//
// No se commitea (.gitignore): se genera en cada `pnpm dev` y `pnpm build`.
import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const raiz = path.dirname(require.resolve("pdfjs-dist/package.json"));
const origen = path.join(raiz, "build", "pdf.worker.min.mjs");
const destino = path.join(process.cwd(), "public", "pdf.worker.mjs");

mkdirSync(path.dirname(destino), { recursive: true });
copyFileSync(origen, destino);
console.log(`pdf.worker → ${path.relative(process.cwd(), destino)}`);

// Y los recursos de apoyo que pdf.js pide aparte, con el mismo criterio de
// versión. El que importa es `wasm/`: sin `jbig2.wasm`, los escaneos en JBIG2
// —el formato de muchos escáneres— salían EN BLANCO en el visor ("JBig2 failed
// to initialize" en la consola), mientras la miniatura de la bandeja, que se
// hace en el servidor con estos mismos ficheros, se veía bien. `cmaps/` y
// `standard_fonts/` son para el texto de los PDF que no traen sus fuentes;
// `iccs/`, para los perfiles de color.
const apoyo = path.join(process.cwd(), "public", "pdfjs");
for (const dir of ["wasm", "cmaps", "standard_fonts", "iccs"]) {
  cpSync(path.join(raiz, dir), path.join(apoyo, dir), { recursive: true });
}
console.log(`pdf.js (wasm, cmaps, fuentes, iccs) → ${path.relative(process.cwd(), apoyo)}`);
