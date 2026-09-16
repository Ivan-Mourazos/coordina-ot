import { afterAll, expect, test } from "vitest";
import sql from "mssql";
import { getPoolOlanet } from "../src/lib/server/db";
import { finalizarFase } from "../src/lib/server/olanet";
import { esFaseDeLaWeb } from "../src/lib/secciones";

// ════════════════════════════════════════════════════════════════════════
//  ATENCIÓN — ESTO ESCRIBE EN OLANET REAL. NO LO EJECUTA NINGÚN AGENTE.
//  SOLO IVÁN, A MANO, CON DAVID/IT AVISADOS ANTES DE CADA EJECUCIÓN.
// ════════════════════════════════════════════════════════════════════════
//
// Sección 2 de la spec del 15/09/2026 ("Ensayo antes de producción"), punto 4:
// no hay forma neutra de escribir un 3 (R4 del informe finalizar-of-olanet.md),
// así que el último escalón antes de producción es cerrar una operación YA
// MUERTA — de las de arrastre 2020-2024, casi todas de urgencias (U-A-OTEC) y
// en pedidos entregados hace años — con la MISMA función que usan las dos
// rutas (`finalizarFase`, Tarea 3). Esto NO prueba el botón ni el corte del
// fichaje: esas operaciones no están en el tablero, no tienen autor y nadie
// las ficha. Lo que prueba es que `finalizarFase` escribe UN solo movimiento
// a 3 y que la segunda llamada no repite nada.
//
// ─── ANTES DE EJECUTARLO, IVÁN A MANO ─────────────────────────────────────
//  1. Avisar a David/IT, como se hizo con el primer 3 del fichaje.
//  2. Elegir una fase muerta de verdad, por ejemplo con:
//       SELECT TOP 5 IdBoletin, Orden, Fase, MaquinaTeo, IdEstadoOF
//         FROM scg_Fases
//        WHERE MaquinaTeo LIKE '%OTEC%' AND IdEstadoOF IN (0, 1, 2)
//        ORDER BY IdBoletin
//     y comprobar en RPS que esa Orden es de un pedido entregado hace años
//     (no del tablero actual, no de un pedido con actividad reciente).
//  3. Apuntar ANTES de ejecutar, contra OLANET real, el estado de esa fase:
//       SELECT IdBoletin, Orden, Fase, MaquinaTeo, IdEstadoOF
//         FROM scg_Fases WHERE IdBoletin = <IdBoletin>;
//       SELECT * FROM sch_FasesMov
//         WHERE IdBoletin = <IdBoletin> ORDER BY dhMovimiento;
//     `IdEstadoOF` debe estar en 0, 1 o 2 (no ya en 3 ni en 4/eliminada), y
//     `sch_FasesMov` no debe tener ya un movimiento a 3 para ese IdBoletin.
//  4. Ejecutar, con las cuatro variables rellenas y NUNCA en CI:
//       ENSAYO_CERRAR_FASE_MUERTA=1 ENSAYO_ID_BOLETIN=<IdBoletin> \
//       ENSAYO_OF=<Orden> ENSAYO_FASE=<Fase> ENSAYO_OPERARIO_RPS=<código> \
//       node --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/ensayo-cerrar-fase-muerta.test.ts
//  5. Comprobar DESPUÉS, con las mismas dos consultas del paso 3:
//       - `scg_Fases.IdEstadoOF` ahora en 3.
//       - `sch_FasesMov` tiene EXACTAMENTE UN movimiento nuevo a IdEstadoOF = 3
//         para ese IdBoletin, con la fecha de hoy y el operario del paso 4.
//     El propio test ya repite esta cuenta con una consulta (ver más abajo),
//     pero la comprobación a mano en RPS/OLANET es la que de verdad cierra el
//     ensayo: no basta con que el test en verde lo diga.
//
// ─── QUÉ NO HACE ESTE SCRIPT ───────────────────────────────────────────────
// No lo dispara `pnpm test` (el `skipIf` lo salta siempre que falte
// ENSAYO_CERRAR_FASE_MUERTA=1, que nunca está puesta en CI ni en desarrollo
// normal). No prueba el botón «Dar por terminada en RPS», ni el corte del
// fichaje, ni el drenado de la cola: eso lo cubren los tests de
// `api-fases-cerrar-of.test.ts` (Tarea 3/6) contra una base de datos SQLite
// temporal, nunca contra OLANET real.

const ACTIVO = process.env.ENSAYO_CERRAR_FASE_MUERTA === "1";

afterAll(async () => {
  if (!ACTIVO) return;
  await (await getPoolOlanet()).close();
});

test.skipIf(!ACTIVO)(
  "cierra una fase muerta de verdad, y la segunda llamada no repite el movimiento",
  async () => {
    const idBoletin = process.env.ENSAYO_ID_BOLETIN;
    const of = process.env.ENSAYO_OF;
    const fase = process.env.ENSAYO_FASE;
    const operarioRps = process.env.ENSAYO_OPERARIO_RPS;
    if (!idBoletin || !of || !fase || !operarioRps) {
      throw new Error("Faltan ENSAYO_ID_BOLETIN / ENSAYO_OF / ENSAYO_FASE / ENSAYO_OPERARIO_RPS");
    }

    const r1 = await finalizarFase({ idBoletin, of, fase, esNuestra: esFaseDeLaWeb, operarioRps, cuando: new Date() });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.yaEstaba).toBe(false);

    // Idempotente: la segunda llamada no debe dejar un segundo apunte.
    const r2 = await finalizarFase({ idBoletin, of, fase, esNuestra: esFaseDeLaWeb, operarioRps, cuando: new Date() });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.yaEstaba).toBe(true);

    const pool = await getPoolOlanet();
    const movs = await pool
      .request()
      .input("idBoletin", sql.BigInt, idBoletin)
      .query<{ n: number }>("SELECT COUNT(*) AS n FROM sch_FasesMov WHERE IdBoletin = @idBoletin AND IdEstadoOF = 3");
    expect(movs.recordset[0].n).toBe(1);
  },
  60_000,
);
