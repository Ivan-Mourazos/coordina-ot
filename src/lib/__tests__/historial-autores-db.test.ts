import { afterAll, expect, test, vi } from "vitest";

vi.hoisted(() => { vi.stubEnv("DATASOURCE", "rps"); });
vi.mock("../server/estado-db", () => ({
  leerPedidosPasados: () => new Map(),
  leerOverlay: () => ({ ofs: new Map() }),
}));
vi.mock("../server/db", () => ({ getPool: async () => ({ request: () => ({
  input() { return this; },
  query: async (sql: string) => ({ recordset: sql.includes("SELECT CodEmployee AS codigo") ? [
    { codigo: "901", nombre: "SÁNCHEZ MERA, JOSÉ MANUEL" },
    { codigo: "902", nombre: "LÓPEZ GARCÍA, SILVIA" },
    { codigo: "903", nombre: "VILLAR GARCÍA, TAMARA" },
  ] : sql.includes("OFFSET @off") ? [
    { pedido: "AR.26.00001", n_of: 1, finalizada: new Date("2026-09-10"), cliente: "Cliente" },
    { pedido: "AR.26.04413", n_of: 1, finalizada: new Date("2026-09-10"), cliente: "Cliente" },
  ] : sql.includes("SUM(i.ExecutionTime)") ? [
    { pedido: "AR.26.00001", orden: "1", tarea: "1", centro: "ot", empleado: "903", minutos: 7 },
    { pedido: "AR.26.00001", orden: "1", tarea: "2", centro: "diseno", empleado: "902", minutos: 50 },
    { pedido: "AR.26.00001", orden: "1", tarea: "3", centro: "taller", empleado: "901", minutos: 150 },
    { pedido: "AR.26.04413", orden: "0231922", tarea: "5", centro: "taller", empleado: "901", minutos: 22 },
    { pedido: "AR.26.04413", orden: "0231922", tarea: "5", centro: "taller", empleado: "902", minutos: 12 },
  ] : [] }),
}) }) }));

import { leerHistorialPagina } from "../server/historial-db";
afterAll(() => vi.unstubAllEnvs());

test("OT muestra su autor aunque Taller tenga muchos más minutos", async () => {
  const { pedidos } = await leerHistorialPagina({ page: 0, seccion: "ot" });
  expect(pedidos[0].autores).toEqual(["Tamara Villar"]);
});

test("Diseño muestra la autora de Diseño, con nombre y primer apellido", async () => {
  const { pedidos } = await leerHistorialPagina({ page: 0, seccion: "diseno" });
  expect(pedidos[0].autores).toEqual(["Silvia López"]);
});

test("sin tareas propias muestra los autores del otro centro y nunca códigos", async () => {
  for (const seccion of ["ot", "diseno"] as const) {
    const { pedidos } = await leerHistorialPagina({ page: 0, seccion });
    expect(pedidos[1].autores).toEqual(["José Manuel Sánchez", "Silvia López"]);
  }
});
