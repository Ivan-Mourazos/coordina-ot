// PreToolUse (Edit|Write): impide editar lockfiles a mano.
// El lockfile solo lo cambia pnpm (pnpm add / pnpm install).
import { basename } from "node:path";

const LOCKFILES = new Set(["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]);

let entrada = "";
for await (const trozo of process.stdin) entrada += trozo;

let ruta = "";
try {
  ruta = JSON.parse(entrada)?.tool_input?.file_path ?? "";
} catch {
  process.exit(0); // Sin JSON legible no bloqueamos.
}

if (LOCKFILES.has(basename(ruta))) {
  console.error(
    `Bloqueado: ${basename(ruta)} no se edita a mano. Usa pnpm (pnpm add / pnpm install) para cambiar dependencias.`,
  );
  process.exit(2);
}
