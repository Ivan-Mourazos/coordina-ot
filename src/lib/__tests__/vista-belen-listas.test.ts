import { describe, expect, test, vi } from "vitest";
import type sql from "mssql";
import { esIdLista, LISTAS_BELEN, type IdLista } from "../vista-belen-listas";
import { CONSULTAS, leerListaBelen } from "../server/vista-belen-listas-db";
import { getPool } from "../server/db";

vi.mock("../server/db", () => ({ getPool: vi.fn() }));

// Record obliga a actualizar esta lista si se amplía la unión IdLista: no
// basta con que definición y consulta olviden por accidente la misma clave.
const IDS = {
  "una-tarea": true,
  "bultos-subidos": true,
  "desfase": true,
  "fechas-comprometidas": true,
  "varias-maquinas": true,
  "sin-descripcion": true,
} satisfies Record<IdLista, true>;

const NUEVAS = ["desfase", "fechas-comprometidas", "varias-maquinas", "sin-descripcion"] as const;

function poolCon(filas: Record<string, unknown>[]) {
  const query = vi.fn().mockResolvedValue({ recordset: filas });
  return { pool: { request: () => ({ query }) } as unknown as sql.ConnectionPool, query };
}

describe("registro de listas de Belén", () => {
  test("cada IdLista tiene definición y consulta, sin ids repetidos", () => {
    const ids = Object.keys(IDS).sort();
    expect(LISTAS_BELEN.map((l) => l.id).sort()).toEqual(ids);
    expect(Object.keys(CONSULTAS).sort()).toEqual(ids);
    expect(new Set(LISTAS_BELEN.map((l) => l.id)).size).toBe(LISTAS_BELEN.length);
  });

  test.each(LISTAS_BELEN)("$id: columnas únicas y navegación al pedido", (lista) => {
    const claves = lista.columnas.map((c) => c.clave);
    expect(new Set(claves).size).toBe(claves.length);
    expect(claves).toContain("of");
    expect(claves).toContain("pedido");
    expect(lista.label.trim()).not.toBe("");
    expect(lista.explica.trim()).not.toBe("");
  });

  test("solo admite los ids publicados", () => {
    for (const id of Object.keys(IDS)) expect(esIdLista(id)).toBe(true);
    for (const id of ["", "DESFASE", "desfase ", null, undefined, {}, 2]) {
      expect(esIdLista(id)).toBe(false);
    }
  });

  test.each(Object.keys(IDS) as IdLista[])("%s acepta una lista vacía", async (id) => {
    const { pool } = poolCon([]);
    await expect(CONSULTAS[id](pool)).resolves.toEqual([]);
  });

  test("en mock no intenta conectar con RPS", async () => {
    vi.stubEnv("DATASOURCE", "mock");
    try {
      for (const id of Object.keys(IDS) as IdLista[]) {
        await expect(leerListaBelen(id)).resolves.toEqual([]);
      }
      expect(getPool).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("valores de las comprobaciones", () => {
  test.each(NUEVAS)("%s recorta textos sin perder ceros ni signos", async (id) => {
    const original = {
      clave: " id-1 ", of: " 0233680 ", pedido: " AR.26.05381 ",
      cliente: " Cliente ", formaEntrega: "   ", referencia: null,
      cantidadOF: 1, cantidadSubida: 2, diferencia: -1, prioridad: 0,
      bultosSubidos: " SI ", maquinas: " A-CFAC, A-CONF ",
    };
    const { pool } = poolCon([original]);
    await expect(CONSULTAS[id](pool)).resolves.toEqual([{
      ...original, clave: "id-1", of: "0233680", pedido: "AR.26.05381",
      cliente: "Cliente", formaEntrega: null, bultosSubidos: "SI", maquinas: "A-CFAC, A-CONF",
    }]);
    expect(original.clave).toBe(" id-1 ");
    expect(original.cliente).toBe(" Cliente ");
  });

  test("las fechas SQL salen ISO y los marcadores de 1900 quedan vacíos", async () => {
    const { pool } = poolCon([{
      clave: "id", of: "0233680", pedido: "AR.26.05381",
      fechaComprometida: new Date("2026-11-13T00:00:00.000Z"),
      fechaFabricacion: new Date("1900-01-01T00:00:00.000Z"),
      fechaExigida: null,
    }]);
    const [fila] = await CONSULTAS["fechas-comprometidas"](pool);
    expect(fila.fechaComprometida).toBe("2026-11-13");
    expect(fila.fechaFabricacion).toBeNull();
    expect(fila.fechaExigida).toBeNull();
  });

  test("respeta el orden de fechas que devuelve RPS", async () => {
    const { pool } = poolCon([
      { clave: "a", of: "1", pedido: "AR.1", fechaComprometida: new Date("2026-11-06T00:00:00Z") },
      { clave: "b", of: "2", pedido: "AR.2", fechaComprometida: new Date("2026-11-13T00:00:00Z") },
    ]);
    const filas = await CONSULTAS["fechas-comprometidas"](pool);
    expect(filas.map((f) => f.fechaComprometida)).toEqual(["2026-11-06", "2026-11-13"]);
  });
});
