import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { query, input } = vi.hoisted(() => ({ query: vi.fn(), input: vi.fn() }));
vi.mock("../server/db", () => ({ getPool: async () => ({ request: () => ({
  input: (...args: unknown[]) => { input(...args); return { query }; },
}) }) }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DATASOURCE", "rps");
  query.mockReset(); input.mockReset();
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

test("solo consulta el pedido abierto, comparte la carga y renueva sus fotos a los cinco minutos", async () => {
  query.mockResolvedValue({ recordset: [{ asistencia: "OM1", tipo: "PM", foto: "http://foto/1.jpg", n: 1 }] });
  const { fotosDeVisita } = await import("../server/fotos-visita");
  const [a, b] = await Promise.all([fotosDeVisita("ar.26.00001"), fotosDeVisita("AR.26.00001")]);
  expect(a).toEqual(b);
  expect(a[0]).toMatchObject({ clase: "Fotos de la instalación", descripcion: "Foto 1 de la instalación OM1" });
  expect(query).toHaveBeenCalledTimes(1);
  expect(input).toHaveBeenCalledWith("pedido", "AR.26.00001");
  query.mockResolvedValue({ recordset: [{ asistencia: "OM2", tipo: "VT", foto: "http://foto/2.jpg", n: 1 }] });
  const otro = await fotosDeVisita("AR.26.00002");
  expect(otro[0].clase).toBe("Fotos de la visita");
  expect(await fotosDeVisita("AR.26.00001")).toEqual(a);
  expect(query).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(5 * 60_000);
  expect(await fotosDeVisita("AR.26.00001")).toEqual(otro);
  expect(query).toHaveBeenCalledTimes(3);
});

test("un fallo no envenena la caché ni impide reintentar", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  query.mockRejectedValueOnce(new Error("RPS no disponible"));
  const { fotosDeVisita } = await import("../server/fotos-visita");
  expect(await fotosDeVisita("AR.26.00003")).toEqual([]);
  query.mockResolvedValue({ recordset: [{ asistencia: "OM3", tipo: null, foto: "http://foto/3.jpg", n: 1 }] });
  expect(await fotosDeVisita("AR.26.00003")).toHaveLength(1);
  expect(query).toHaveBeenCalledTimes(2);
});
