// PostToolUse (Edit|Write): tsc --noEmit tras tocar un .ts/.tsx del proyecto.
// Si hay errores, exit 2 para que el agente los vea y los corrija.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";

let entrada = "";
for await (const trozo of process.stdin) entrada += trozo;

let ruta = "";
try {
  ruta = JSON.parse(entrada)?.tool_input?.file_path ?? "";
} catch {
  process.exit(0);
}

const raiz = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const rel = relative(raiz, ruta);
const fueraDelProyecto = !rel || rel.startsWith("..") || isAbsolute(rel);
const ignorada = /^(node_modules|\.next|\.claude)[\\/]/.test(rel);

if (!/\.(ts|tsx|mts|cts)$/.test(ruta) || fueraDelProyecto || ignorada) process.exit(0);

const tsc = join(raiz, "node_modules", "typescript", "bin", "tsc");
if (!existsSync(tsc)) process.exit(0); // Sin dependencias instaladas no hay nada que comprobar.

const r = spawnSync(process.execPath, [tsc, "--noEmit", "-p", "tsconfig.json"], {
  cwd: raiz,
  encoding: "utf8",
});

if (r.status !== 0) {
  const salida = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n");
  const recorte = salida.slice(0, 30).join("\n");
  const resto = salida.length > 30 ? `\n… y ${salida.length - 30} líneas más` : "";
  console.error(`tsc encontró errores:\n${recorte}${resto}`);
  process.exit(2);
}
