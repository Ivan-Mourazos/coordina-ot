import { afterAll, expect, test, vi } from "vitest";

const estado = vi.hoisted(() => {
  vi.stubEnv("DATASOURCE", "rps");
  return { cerrado: false, pool: null as null | { close(): Promise<unknown> } };
});
vi.mock("../src/lib/server/nombres-historial", () => ({ nombresHistorial: async () => new Map() }));
vi.mock("../src/lib/server/estado-db", () => ({
  leerOverlay: () => ({ ofs: new Map() }),
  leerPedidosPasados: () => new Map([["AR.26.00001", { at: "2026-09-11T06:00:00.000Z", operarioId: null }]]),
}));
vi.mock("../src/lib/server/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/lib/server/db")>();
  return { getPool: async () => {
    const pool = await original.getPool();
    estado.pool = pool;
    return { request: () => {
      const req = pool.request();
      return {
        input(nombre: string, valor: unknown) { req.input(nombre, valor); return this; },
        async query(sql: string) {
          if (!sql.includes("OFFSET @off")) return { recordset: [] };
          // La consulta REAL se ejecuta contra tablas temporales de esta llamada.
          // Ninguna tabla, fila ni marca de producción se escribe.
          const tablas = {
            CPRMOResourceMachine: "IDMOTask int, CodMOResourceMachine nvarchar(20)",
            tgm_estadosof_olanet: "orden nvarchar(20), fase nvarchar(20), idestadoof int, fecha_cambio datetime2",
            CPRManufacturingOrder: "IDManufacturingOrder int, CodManufacturingOrder nvarchar(20), CodCompany nvarchar(3)",
            CPRMOTask: "IDManufacturingOrder int, IDMOTask int, CodMOTask nvarchar(20), Description nvarchar(80), PercentProgress int, RealEndDate datetime2",
            FACOrderSL: "IDOrder int, CodOrder nvarchar(25), OrderDate datetime2, CodCompany nvarchar(3), IDCustomer int, IDCustomerDeliveryAddress int",
            FACOrderLineSL: "IDOrder int, IDManufacturingOrder int",
            FACCustomer: "IDCustomer int, Description nvarchar(80)",
            FACCustomerDeliveryAddress: "IDCustomerDeliveryAddress int, Description nvarchar(80)",
          };
          let preparar = "";
          for (const [tabla, columnas] of Object.entries(tablas)) {
            preparar += `CREATE TABLE #UI_${tabla} (${columnas});\n`;
            sql = sql.replaceAll(`dbo.${tabla}`, `#UI_${tabla}`);
          }
          preparar += `
            INSERT INTO #UI_FACOrderSL VALUES (1,'AR.26.00001','2026-09-10','001',1,NULL), (2,'AR.26.00002','2026-09-09','001',1,NULL);
            INSERT INTO #UI_FACCustomer VALUES (1,'Cliente de prueba');
            INSERT INTO #UI_FACOrderLineSL VALUES (1,1),(1,1),(2,2);
            INSERT INTO #UI_CPRManufacturingOrder VALUES (1,'0000001','001'),(2,'0000002','001');
            INSERT INTO #UI_CPRMOTask VALUES (1,1,'5','PLANTEAR',0,NULL),(2,2,'5','PLANTEAR',0,NULL),(1,3,'9','DISEÑO',0,NULL),(2,4,'9','DISEÑO',0,NULL);
            INSERT INTO #UI_CPRMOResourceMachine VALUES (1,'A-OTEC'),(2,'A-OTEC'),(3,'A-DGRA'),(4,'A-DGRA');
          `;
          if (estado.cerrado) preparar += "INSERT INTO #UI_tgm_estadosof_olanet VALUES ('0000001','5',3,'2026-09-11'),('0000001','9',3,'2026-09-11');";
          return req.query(preparar + sql);
        },
      };
    } };
  } };
});

import { leerHistorialPagina } from "../src/lib/server/historial-db";
afterAll(async () => { await estado.pool?.close(); vi.unstubAllEnvs(); });

// Opt-in: VALIDAR_RPS_UI=1 y node --env-file=.env.local node_modules/vitest/vitest.mjs
// run scripts/verificar-historial-ui.test.ts. La suite ordinaria no conecta a RPS.
test.skipIf(process.env.VALIDAR_RPS_UI !== "1")("paso local aparece una sola vez antes y después del cierre RPS; reapertura lo excluye", async () => {
  for (const seccion of ["ot", "diseno"] as const) {
    for (const cerrado of [false, true]) {
      estado.cerrado = cerrado;
      const r = await leerHistorialPagina({ page: 0, seccion });
      expect(r.pedidos.map((p) => p.pedido)).toEqual(["AR.26.00001"]);
      expect(r.pedidos[0].nOf).toBe(1); // dos líneas de venta, una sola OF
      expect(r.pedidos[0].pasadoAt).toBe("2026-09-11T06:00:00.000Z");
      expect(r.hasMore).toBe(false);
      const reabierto = await leerHistorialPagina({ page: 0, seccion, pendientes: ["AR.26.00001"] });
      expect(reabierto.pedidos).toEqual([]);
      const busqueda = await leerHistorialPagina({ page: 0, seccion, q: "AR.26.00001" });
      expect(busqueda.pedidos).toHaveLength(1);
      const fecha = await leerHistorialPagina({ page: 0, seccion, desde: "2026-09-11", hasta: "2026-09-12" });
      expect(fecha.pedidos).toHaveLength(1);
      const anterior = await leerHistorialPagina({ page: 0, seccion, hasta: "2026-09-11" });
      expect(anterior.pedidos).toEqual([]);
    }
  }
}, 60_000);
