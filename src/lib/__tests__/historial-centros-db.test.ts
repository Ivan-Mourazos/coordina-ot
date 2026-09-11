import { afterAll, expect, test, vi } from "vitest";

vi.hoisted(() => { vi.stubEnv("DATASOURCE", "rps"); });
vi.mock("../server/db", () => ({
  getPool: async () => ({ request: () => ({
    input() { return this; },
    query: async (sql: string) => ({ recordset: sql.includes("WITH Tareas AS") ? [
      { orden: "0230001", descripcion: "Compartida", centro: "ot", tarea: "01", empleado: "10", minutos: 7 },
      { orden: "0230001", descripcion: "Compartida", centro: "diseno", tarea: "02", empleado: "88", minutos: 45 },
      { orden: "0230001", descripcion: "Compartida", centro: "taller", tarea: "03", empleado: "99", minutos: 998 },
    ] : [] }),
  }) }),
}));
vi.mock("../server/fichaje-db", () => ({ leerTodosIntervalos: () => [] }));
vi.mock("../fichaje", () => ({ agregarPorRol: () => new Map([
  ["0230001:1", { planteoMin: 7, revisionMin: 0, operarios: { plantear: { alberto: 7 }, revisar: {} } }],
  ["0230001:02", { planteoMin: 45, revisionMin: 0, operarios: { plantear: { carron: 45 }, revisar: {} } }],
  ["0230001:03", { planteoMin: 999, revisionMin: 0, operarios: { plantear: { alberto: 999 }, revisar: {} } }],
]) }));

import { leerHistorialPedido } from "../server/historial-db";

afterAll(() => vi.unstubAllEnvs());

test("la lectura real separa también los roles locales por tarea y no los atribuye al taller", async () => {
  const ofs = await leerHistorialPedido("SA.26.00498");
  const ot = ofs.find((of) => of.centro === "ot")!;
  const diseno = ofs.find((of) => of.centro === "diseno")!;
  const taller = ofs.find((of) => of.centro === "taller")!;
  expect(ot.rol?.planteo).toEqual([{ nombre: "Alberto Carbon", min: 7 }]);
  expect(diseno.rol?.planteo).toEqual([{ nombre: "José Luis Carrón", min: 45 }]);
  expect(taller.tiempoImputadoMin).toBe(998);
  expect(taller.rol).toBeUndefined();
  expect(taller.rolDeducido).toBeUndefined();
});
