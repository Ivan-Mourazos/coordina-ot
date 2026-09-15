import { afterAll, expect, test } from "vitest";
import { getPool, getPoolOlanet } from "../src/lib/server/db";
import { leerDonde } from "../src/lib/server/publico-db";

// Contra RPS y OLANET reales, solo lectura. El pedido es el del ejemplo de la
// spec; si ya no está en fábrica, cambiar el código por otro que lo esté.
//
// Opt-in: VALIDAR_RPS_UI=1 DATASOURCE=rps node --env-file=.env.local
// node_modules/vitest/vitest.mjs run scripts/verificar-consulta-donde.test.ts

const ACTIVO = process.env.VALIDAR_RPS_UI === "1";

afterAll(async () => {
  if (!ACTIVO) return;
  await (await getPool()).close();
  await (await getPoolOlanet()).close();
});

test.skipIf(!ACTIVO)("dónde está AR.26.04082, con nombres y en menos de 2 s", async () => {
  // La primera llamada abre los dos pools (RPS y OLANET) y trae el catálogo de
  // nombres: 3,1 s medidos, que en el servidor solo pagaría el primero que
  // entre tras un despliegue. Lo que importa es lo que tarda con las
  // conexiones ya abiertas, que es como llega cada página.
  const frio = Date.now();
  await leerDonde(["AR.26.04082"]);
  const msFrio = Date.now() - frio;

  const t0 = Date.now();
  const donde = await leerDonde(["AR.26.04082"]);
  const ms = Date.now() - t0;
  console.info({ msFrio, ms }, JSON.stringify(donde.get("AR.26.04082"), null, 2));
  expect(ms).toBeLessThan(2_000);
}, 60_000);
