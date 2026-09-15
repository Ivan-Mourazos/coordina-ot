import { beforeAll, expect, test, vi } from "vitest";

// ─── Con OLANET caído, la lista carga igual ──────────────────────────────────
// Se dice por dónde va el pedido, sin nombres ni pausas, en vez de un error.
// RPS se simula con una fila por tarea.

vi.mock("../server/db", () => {
  const filas = [
    {
      pedido: "AR.26.04082", orden: "0231429", tarea: "5",
      descripcion: "PLANTEAR Y PREPARAR ARCHIVOS", centro: "CALDERERIA", es_fin: 0, cerrada: 0,
    },
    {
      pedido: "AR.26.04082", orden: "0231429", tarea: "2",
      descripcion: "PLANTEAR", centro: "OFICINA TECNICA ARZUA", es_fin: 0, cerrada: 1,
    },
  ];
  const request = () => {
    const req = { input: () => req, query: async () => ({ recordset: filas }) };
    return req;
  };
  return {
    getPool: async () => ({ request }),
    getPoolOlanet: async () => {
      throw new Error("OLANET no contesta");
    },
  };
});

vi.mock("../server/nombres-historial", () => ({
  nombresHistorial: async () => new Map([["187", "Adrián Quinteiro"]]),
}));

let leerDonde: typeof import("../server/publico-db").leerDonde;

beforeAll(async () => {
  process.env.DATASOURCE = "rps";
  ({ leerDonde } = await import("../server/publico-db"));
});

test("sin OLANET, cada pedido en fábrica sigue diciendo por dónde va, sin nombres", async () => {
  const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
  const donde = await leerDonde(["AR.26.04082"]);
  expect(donde.get("AR.26.04082")).toEqual([
    {
      orden: "0231429",
      enCurso: [],
      pausadas: [],
      siguientes: [{ paso: "Calderería", tarea: "Plantear y preparar archivos", quien: null, desde: null }],
    },
  ]);
  expect(aviso).toHaveBeenCalled();
  aviso.mockRestore();
});

test("sin pedidos no se pregunta a nadie", async () => {
  expect((await leerDonde([])).size).toBe(0);
});
