import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Despliegue sin caída (scripts/desplegar.sh): hay dos carpetas de build,
// .next-a y .next-b. Se compila en la que no está sirviendo mientras la web
// sigue en pie con la otra, y el fichero .next-activa dice cuál usa
// `next start`. Compilar encima de la carpeta en uso dejaba la web rota
// durante todo el build. El nombre no se puede cambiar después de compilar:
// Next lo deja escrito dentro del código generado.
function carpetaDeBuild(): string {
  if (process.env.NEXT_DIST_DIR) return process.env.NEXT_DIST_DIR;
  try {
    const activa = readFileSync(path.join(process.cwd(), ".next-activa"), "utf8").trim();
    if (activa === ".next-a" || activa === ".next-b") return activa;
  } catch {
    // Sin fichero: instalación de siempre (y desarrollo en local).
  }
  return ".next";
}

const nextConfig: NextConfig = {
  distDir: carpetaDeBuild(),
  // Nativos de Node: fuera del bundle de Server Components (require normal).
  serverExternalPackages: ["better-sqlite3", "mssql"],
};

export default nextConfig;
