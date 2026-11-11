import { afterEach, expect, test, vi } from "vitest";
import type { BaseHistorial, IndiceHistorial } from "../historial-indice";
import { SECCION_POR_DEFECTO } from "../secciones";

const { indiceSiListo, asegurarIndice } = vi.hoisted(() => ({ indiceSiListo: vi.fn(), asegurarIndice: vi.fn() }));
vi.mock("../server/historial-indice", () => ({ indiceSiListo, asegurarIndice }));
import { leerEntregasBelen } from "../server/entregas-belen-db";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

test("usa la entrega de Coordina; AR y delegaciones (SA, BE) todavía sin entregar", async () => {
  vi.stubEnv("DATASOURCE", "rps");
  const fila = (pedido: string, pendienteEntrega = true): BaseHistorial => ({
    pedido, pendienteEntrega, fechaEntrega: Date.parse("2026-11-13T00:00:00Z"), trabajoAbierto: false, nOf: 4,
    fechaPedido: null, fechaEntregado: null, tieneSeccion: true, pendienteSeccion: false, pendienteTotal: false, finalizada: null,
  });
  const indice = { base: { [SECCION_POR_DEFECTO]: [fila("AR.26.1"), fila("AR.26.2", false), fila("SA.26.1"), fila("LA.26.1")] }, info: new Map() } as unknown as IndiceHistorial;
  indiceSiListo.mockReturnValue(indice);
  const base = { cliente: null, ciudad: null, fechaEntrega: "2026-11-13", situacion: "salir", ofs: 4 };
  expect(await leerEntregasBelen()).toEqual([{ codigo: "AR.26.1", ...base }, { codigo: "SA.26.1", ...base }]);
  expect(asegurarIndice).toHaveBeenCalledOnce();
});

test("un índice todavía no disponible se comunica como error, nunca como lista vacía", async () => {
  vi.stubEnv("DATASOURCE", "rps");
  indiceSiListo.mockReturnValue(null);
  await expect(leerEntregasBelen()).rejects.toThrow(/preparando/);
});
