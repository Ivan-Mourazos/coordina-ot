import { afterEach, expect, test, vi } from "vitest";
import type sql from "mssql";

const { getPool } = vi.hoisted(() => ({ getPool: vi.fn() }));
vi.mock("../server/db", () => ({ getPool }));
import { articuloConCantidad, leerEntregasBelen } from "../server/entregas-belen-db";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

test("una fila por OF con la línea pendiente de entregar, recortada y con la fecha solicitada", async () => {
  vi.stubEnv("DATASOURCE", "rps");
  const query = vi.fn().mockResolvedValue({ recordset: [{
    codigo: " AR.26.05272 ", of: "0233424 ", cliente: "PALETS CERVELO, S. L. ,", prioridad: 2, cantidad: 2,
    articulo: "CAMTELTOLMOT ", articuloDescripcion: "CAMBIO DE TELA", formaEntrega: "INSTALAR", rotulacion: "  ",
    fSol: new Date("2026-11-12T00:00:00Z"),
  }] });
  getPool.mockResolvedValue({ request: () => ({ query }) } as unknown as sql.ConnectionPool);
  expect(await leerEntregasBelen()).toEqual([{
    codigo: "AR.26.05272", of: "0233424", cliente: "PALETS CERVELO, S. L. ,", prioridad: 2, articulo: "2 × CAMTELTOLMOT",
    articuloDescripcion: "CAMBIO DE TELA", formaEntrega: "INSTALAR", rotulacion: null, fechaEntrega: "2026-11-12",
  }]);
  // Solo lo pendiente de entregar y de AR, SA y BE.
  expect(query.mock.calls[0][0]).toMatch(/PendingDelivery = 1/);
  expect(query.mock.calls[0][0]).toMatch(/'SA\.%'/);
});

test("el artículo con sus unidades, sin ceros de sobra", () => {
  expect(articuloConCantidad(1, "CARPRECT2")).toBe("1 × CARPRECT2");
  expect(articuloConCantidad(29.9, "REJILLA")).toBe("29,9 × REJILLA");
  expect(articuloConCantidad(null, "X")).toBe("X");
  expect(articuloConCantidad(3, null)).toBeNull();
});
