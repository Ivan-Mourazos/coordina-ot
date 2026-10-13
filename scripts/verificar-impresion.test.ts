import sql from "mssql";
import { afterAll, expect, test } from "vitest";
import { getPool, getPoolOlanet } from "../src/lib/server/db";
import { fasesPendientesDe } from "../src/lib/server/olanet";
import { SECCIONES } from "../src/lib/secciones";

// ─── El tablero de Impresión contra OLANET y RPS de verdad ──────────────────
// Solo lectura. Opt-in:
//   VALIDAR_RPS_UI=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/verificar-impresion.test.ts

const ACTIVO = process.env.VALIDAR_RPS_UI === "1";

afterAll(async () => {
  if (!ACTIVO) return;
  await (await getPool()).close();
  await (await getPoolOlanet()).close();
});

test.skipIf(!ACTIVO)("la cola de impresión es de impresión y de nadie más", async () => {
  const fases = await fasesPendientesDe(SECCIONES.impresion);
  console.info(`[impresion] ${fases.length} fases vivas`);
  expect(fases.length).toBeGreaterThan(0);

  // Cada fase cuelga en RPS de una tarea con recurso de impresión, y nunca
  // del troquel ni de Diseño. El CodMOTask se compara tal cual ("2" y "02"
  // son tareas distintas), y cada parámetro va tipado para no perder el índice.
  const pool = await getPool();
  const req = pool.request();
  const pares = fases.map((f, i) => {
    req.input(`o${i}`, sql.VarChar(20), f.of);
    req.input(`t${i}`, sql.VarChar(20), f.fase);
    return `(mo.CodManufacturingOrder = @o${i} AND t.CodMOTask = @t${i})`;
  });
  const r = await req.query<{ orden: string; tarea: string; recurso: string }>(`
    SELECT mo.CodManufacturingOrder AS orden, t.CodMOTask AS tarea, LOWER(rm.CodMOResourceMachine) AS recurso
      FROM dbo.CPRManufacturingOrder mo
      JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
      JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = t.IDMOTask
     WHERE mo.CodCompany = '001' AND (${pares.join(" OR ")})`);
  const recursos = new Set(r.recordset.map((f) => f.recurso));
  console.info("[impresion] filas RPS:", r.recordset.length, "recursos en RPS:", [...recursos]);
  for (const rec of recursos) expect(["imdi-a", "p-hpla"]).toContain(rec);
}, 120_000);
