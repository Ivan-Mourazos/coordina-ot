import { expect, test, vi } from "vitest";

const { pagina, tablero } = vi.hoisted(() => ({
  pagina: vi.fn(async () => ({ pedidos: [], hasMore: false })),
  tablero: vi.fn(async () => ({ pedidos: [
    { codigo: "AR.26.04403", situacion: "procesado", ofs: [{ ajenaOT: false, estado: "aprobada" }] },
    { codigo: "AR.26.00002", situacion: "completado", ofs: [{ ajenaOT: false }] },
    { codigo: "AR.26.04413", situacion: "procesado", ofs: [{ ajenaOT: true }] },
  ] })),
}));
vi.mock("../server/historial-db", () => ({ leerHistorialPagina: pagina }));
vi.mock("../data", () => ({ getTablero: tablero }));
import { GET } from "../../app/api/historial/route";

test("entrega el tablero de la sección a la consulta antes de paginar", async () => {
  const res = await GET(new Request("http://x/api/historial?page=2&q=enrollable&seccion=diseno"));
  expect(res.status).toBe(200);
  expect(tablero).toHaveBeenCalledWith("diseno");
  expect(pagina).toHaveBeenCalledWith(expect.objectContaining({
    page: 2, q: "enrollable", seccion: "diseno",
  }), (await tablero.mock.results[0].value).pedidos);
});
