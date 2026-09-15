import { afterAll, expect, test } from "vitest";
import { getPool } from "../src/lib/server/db";
import { construirIndice } from "../src/lib/server/historial-indice";
import { leerHistorialPedidoDetalle } from "../src/lib/server/historial-db";

// Mide lo que cuesta el índice con los dos datos nuevos y compara los totales
// con los medidos el 15/09/2026 (spec v2): 578 pendientes, 382 en fábrica, 196
// esperando salir. Los datos cambian cada día: se admite un 10 %.
//
// Opt-in: VALIDAR_RPS_UI=1 node --env-file=.env.local node_modules/vitest/vitest.mjs
// run scripts/medir-indice-consulta.test.ts

const ACTIVO = process.env.VALIDAR_RPS_UI === "1";

afterAll(async () => {
  if (ACTIVO) await (await getPool()).close();
});

test.skipIf(!ACTIVO)("el índice con trabajo y albarán", async () => {
  const t0 = Date.now();
  const indice = await construirIndice();
  const ms = Date.now() - t0;

  const filas = indice.base.ot;
  const pendientes = filas.filter((b) => b.pendienteEntrega);
  const enFabrica = pendientes.filter((b) => b.trabajoAbierto).length;
  const desde2026 = Date.UTC(2026, 0, 1);
  const entregados2026 = filas.filter((b) => !b.pendienteEntrega && (b.fechaPedido ?? 0) >= desde2026);
  const sinAlbaran2026 = entregados2026.filter((b) => b.fechaEntregado === null).length;

  const t1 = Date.now();
  await leerHistorialPedidoDetalle("AR.26.04082");
  const msFicha = Date.now() - t1;

  console.info({
    ms, msFicha, pendientes: pendientes.length, enFabrica,
    esperandoSalir: pendientes.length - enFabrica,
    entregados2026: entregados2026.length, sinAlbaran2026,
  });

  expect(pendientes.length).toBeGreaterThan(578 * 0.9);
  expect(pendientes.length).toBeLessThan(578 * 1.1);
  expect(ms).toBeLessThan(60_000);
  expect(msFicha).toBeLessThan(2_000);
}, 180_000);
