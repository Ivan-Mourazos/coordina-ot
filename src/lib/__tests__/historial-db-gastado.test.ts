import sql from "mssql";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// mssql se simula por completo: lo que se comprueba es la FORMA de la
// consulta (parámetro tipado, agrupado por OF+material) y el mapeo del
// resultado, no la conexión real.
const query = vi.fn();
const input = vi.fn().mockReturnThis();
const request = vi.fn(() => ({ input, query }));
const getPool = vi.fn(async () => ({ request }));

vi.mock("../server/db", () => ({ getPool: () => getPool() }));

let historialDb: typeof import("../server/historial-db");

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.DATASOURCE = "rps";
  vi.resetModules();
  historialDb = await import("../server/historial-db");
});
afterEach(() => {
  delete process.env.DATASOURCE;
});

test("el parámetro del pedido va tipado VarChar(25)", async () => {
  query.mockResolvedValue({ recordset: [] });
  await historialDb.leerMaterialGastadoPedido("AR.26.04488");
  // El brief pedía comprobar `{ type: 2 }`, pero mssql no representa VarChar
  // como un entero: `sql.VarChar(25)` devuelve `{ type: sql.VarChar, length:
  // 25 }` (comprobado en vivo contra el paquete instalado). Se compara contra
  // la forma real para no quedarnos con una aserción que nunca falla.
  expect(input).toHaveBeenCalledWith("pedido", expect.objectContaining({ type: sql.VarChar, length: 25 }), "AR.26.04488");
});

test("agrupa por OF, sin campos de coste", async () => {
  query.mockResolvedValue({
    recordset: [
      { orden: "0232070 ", material: "TUBO 500", codigo: "TUB500", gastado: 2, ultima_salida: new Date("2026-09-10") },
      { orden: "0232070 ", material: "TUBO 700", codigo: "TUB700", gastado: 1, ultima_salida: new Date("2026-09-12") },
      { orden: "0232071 ", material: "MANIVELA", codigo: "MAN01", gastado: 3, ultima_salida: new Date("2026-09-08") },
    ],
  });
  const r = await historialDb.leerMaterialGastadoPedido("AR.26.04488");
  expect(r["0232070"]).toEqual([
    { material: "TUBO 500", codigo: "TUB500", gastado: 2, ultimaSalida: "2026-09-10" },
    { material: "TUBO 700", codigo: "TUB700", gastado: 1, ultimaSalida: "2026-09-12" },
  ]);
  expect(r["0232071"]).toHaveLength(1);
  // El SQL en sí no pide CostAmountReal: es margen, y la ficha no enseña dinero.
  const sql = query.mock.calls[0][0] as string;
  expect(sql).not.toMatch(/CostAmountReal/);
  expect(sql).toMatch(/HAVING SUM\(i\.Quantity\) <> 0/);
});

test("sin filas, mapa vacío — no 'no se gastó material'", async () => {
  query.mockResolvedValue({ recordset: [] });
  expect(await historialDb.leerMaterialGastadoPedido("AR.26.09999")).toEqual({});
});

test("en modo mock no consulta RPS", async () => {
  delete process.env.DATASOURCE;
  vi.resetModules();
  historialDb = await import("../server/historial-db");
  expect(await historialDb.leerMaterialGastadoPedido("AR.26.04488")).toEqual({});
  expect(getPool).not.toHaveBeenCalled();
});
