import { afterAll, expect, test } from "vitest";
import { getPool } from "../src/lib/server/db";
import { ctesFinalizacionHistorial } from "../src/lib/server/historial-finalizacion-sql";

// getPool() abre conexión real: solo se toca si el test de abajo puede
// correr. Con la suite ordinaria (VALIDAR_RPS_UI sin poner) este afterAll no
// debe intentar hablar con RPS.
afterAll(async () => {
  if (process.env.VALIDAR_RPS_UI !== "1") return;
  await (await getPool()).close();
});

// ─── pendiente_total contra RPS real ──────────────────────────────────────
// El test de src/lib/__tests__/publico-centros.test.ts que fijaba esta regla
// con expect(sql).toContain(...) no podía fallar por un error de lógica: si
// alguien rompiera el JOIN entre Centros y Tareas (p.ej. `ON c.IDMOTask =
// r.IDMOTask` en vez de `t.IDMOTask`), los literales seguirían en el texto
// del SQL y el test seguiría en verde. Aquí se ejecuta el SQL REAL de
// ctesFinalizacionHistorial contra tablas temporales, con el mismo patrón que
// scripts/verificar-historial-ui.test.ts: sustituye dbo.X por #UI_X, mete
// filas de prueba y comprueba pendiente_total en vez del texto de la consulta.
//
// Ninguna tabla, fila ni marca de producción se escribe: la conexión es de
// SOLO LECTURA (usuario de RPS) y lo único que se crea son tablas #temporales
// de esta sesión, que SQL Server tira solas al cerrar la conexión.

// Opt-in: VALIDAR_RPS_UI=1 y node --env-file=.env.local node_modules/vitest/vitest.mjs
// run scripts/verificar-historial-centros.test.ts. La suite ordinaria no conecta a RPS.
test.skipIf(process.env.VALIDAR_RPS_UI !== "1")(
  "pendiente_total solo cuenta tareas con fila en CPRMOResourceMachine",
  async () => {
    const pool = await getPool();
    afterAll(async () => { await pool.close(); });

    const tablas = {
      CPRMOResourceMachine: "IDMOTask int, CodMOResourceMachine nvarchar(20)",
      tgm_estadosof_olanet: "orden nvarchar(20), fase nvarchar(20), idestadoof int, fecha_cambio datetime2",
      CPRManufacturingOrder: "IDManufacturingOrder int, CodManufacturingOrder nvarchar(20), CodCompany nvarchar(3)",
      CPRMOTask: "IDManufacturingOrder int, IDMOTask int, CodMOTask nvarchar(20), Description nvarchar(80), PercentProgress int, RealEndDate datetime2",
      FACOrderSL: "IDOrder int, CodOrder nvarchar(25), OrderDate datetime2, CodCompany nvarchar(3), IDCustomer int, IDCustomerDeliveryAddress int",
      FACOrderLineSL: "IDOrder int, IDManufacturingOrder int, ReceptionDemandDate datetime2, PendingDelivery bit",
    };

    // ctesFinalizacionHistorial(seccion) sin `busqueda`, igual que la llamada
    // real del índice (historial-indice.ts: baseDe). @pendientes vacío: nada
    // vivo en CoordinaOT que excluir.
    let sql = `${ctesFinalizacionHistorial("ot")}
      SELECT pedido, pendiente_total FROM PedFin ORDER BY pedido;`;
    let preparar = "";
    for (const [tabla, columnas] of Object.entries(tablas)) {
      preparar += `CREATE TABLE #UI_${tabla} (${columnas});\n`;
      sql = sql.replaceAll(`dbo.${tabla}`, `#UI_${tabla}`);
    }
    preparar += `
      -- AR.26.00001: una OF con una tarea de TRABAJO (fila en
      -- CPRMOResourceMachine, en un centro cualquiera) sin cerrar en OLANET
      -- → tiene que salir pendiente.
      INSERT INTO #UI_FACOrderSL VALUES (1,'AR.26.00001','2026-09-10','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (1,1,'2026-09-20',0);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (1,'0000001','001');
      INSERT INTO #UI_CPRMOTask VALUES (1,501,'5','19/8 TRABAJO DE VERDAD',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (501,'CALDERERIA');

      -- AR.26.00002: la MISMA tarea (sin cerrar, sin recurso de OT) pero SIN
      -- ninguna fila en CPRMOResourceMachine — como "0 · Materiales" o una
      -- nota tecleada como tarea ("99 · VISITA") — → NO puede salir pendiente,
      -- porque esa pseudo-tarea nunca cierra en OLANET y dejaría el pedido
      -- pendiente para siempre.
      INSERT INTO #UI_FACOrderSL VALUES (2,'AR.26.00002','2026-09-10','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (2,2,'2026-09-20',0);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (2,'0000002','001');
      INSERT INTO #UI_CPRMOTask VALUES (2,502,'5','99 · NOTA SIN CENTRO',0,NULL);
    `;

    const req = pool.request();
    req.input("pendientes", "<pedidos></pedidos>");
    const r = await req.query<{ pedido: string; pendiente_total: number }>(preparar + sql);
    const porPedido = new Map(r.recordset.map((f) => [f.pedido.trim(), f.pendiente_total]));

    expect(porPedido.get("AR.26.00001")).toBe(1);
    expect(porPedido.get("AR.26.00002")).toBe(0);
  },
  60_000,
);
