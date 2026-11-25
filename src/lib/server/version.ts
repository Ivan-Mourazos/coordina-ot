import { readFileSync } from "node:fs";
import path from "node:path";

// ─── Qué versión de la web está sirviendo este servidor ──────────────────────
// Sirve para que un navegador que lleva la pestaña abierta desde antes del
// despliegue se entere de que hay algo nuevo. No es un número de versión que
// nadie lea: es una cadena que CAMBIA con cada compilación, y con eso basta
// para compararla.
//
// Se usa el BUILD_ID de Next, que es justo eso: lo genera al compilar, y es el
// mismo que va en las rutas de `/_next/static/<id>/…`. Por eso es el dato
// correcto y no la fecha de arranque del proceso: reiniciar con PM2 sin haber
// compilado NO cambia el código que tiene el navegador, y avisar ahí sería un
// aviso falso — de los que enseñan a ignorar los avisos.
//
// EN QUÉ CARPETA. Desde el 25/11/2026 se compila en `.next-a` o `.next-b` por
// turnos (scripts/desplegar.sh) y `.next` se queda con la compilación de antes
// de aquello: leerla daba siempre la misma versión y nadie se enteraba de
// ningún despliegue. La carpeta la deja escrita next.config.ts en el propio
// código compilado (`COORDINA_DIST_DIR`), así que cada compilación lee la suya
// aunque `.next-activa` ya apunte a la siguiente.
//
// En desarrollo no hay BUILD_ID (Next recompila al vuelo y ya recarga solo), y
// entonces esto vale "dev" y no se avisa de nada.

let cache: string | null = null;

export function versionDelServidor(): string {
  if (cache) return cache;
  try {
    cache = readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.COORDINA_DIST_DIR || ".next", "BUILD_ID"), "utf8").trim() || "dev";
  } catch {
    cache = "dev";
  }
  return cache;
}
