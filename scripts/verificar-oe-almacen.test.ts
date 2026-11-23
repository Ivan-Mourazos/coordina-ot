// Solo lectura, contra RPS: lista «Pedidos con OE» con las de hoja de almacén
// (pnpm exec vitest run scripts/verificar-oe-almacen.test.ts; deja el resultado en el temporal).
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.loadEnvFile(".env.local");
process.env.DATASOURCE = "rps";
it("con-oe", async () => {
  const { CONSULTAS } = await import("../src/lib/server/vista-belen-listas-db");
  const { getPool } = await import("../src/lib/server/db");
  const pool = await getPool();
  const t = Date.now();
  const filas = await CONSULTAS["con-oe"](pool);
  const lineas = [`ms=${Date.now() - t} filas=${filas.length} almacen=${filas.filter((f) => f.via !== "OF").length}`];
  for (const f of filas) if (f.via !== "OF" || f.recibida) lineas.push(JSON.stringify(f));
  writeFileSync(process.env.SALIDA ?? join(tmpdir(), "verificar-oe.txt"), lineas.join("\n"));
}, 120000);
