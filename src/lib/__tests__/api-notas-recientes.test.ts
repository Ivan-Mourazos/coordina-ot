import { beforeEach, expect, test, vi } from "vitest";

const { quienEs, leerNotasRecientes, soloConSesion } = vi.hoisted(() => ({ quienEs: vi.fn(), leerNotasRecientes: vi.fn(), soloConSesion: vi.fn() }));
vi.mock("../server/sesion", () => ({ loginActivo: () => true, quienEs, soloConSesion }));
vi.mock("../server/notas-db", () => ({ leerNotasRecientes }));
import { GET } from "../../app/api/notas-recientes/route";

beforeEach(() => {
  soloConSesion.mockReturnValue(null);
  leerNotasRecientes.mockReturnValue([
    { id: 1, publica: false, operarioId: "ivan" },
    { id: 2, publica: true, operarioId: "ivan" },
    { id: 3, publica: false, operarioId: "belen" },
  ]);
});

test("la campana de Producción recibe las públicas y las propias", async () => {
  quienEs.mockReturnValue({ id: "belen", roles: ["produccion"] });
  const r = GET(new Request("http://local/api/notas-recientes"));
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect((await r.json()).notas.map((n: { id: number }) => n.id)).toEqual([2, 3]);
});

test("OT conserva también sus avisos de notas internas", async () => {
  quienEs.mockReturnValue({ id: "ivan", roles: ["tecnico"] });
  expect((await GET(new Request("http://local/api/notas-recientes")).json()).notas).toHaveLength(3);
});

test("sin sesión no se leen notas", () => {
  const corte = new Response(null, { status: 401 });
  soloConSesion.mockReturnValue(corte);
  leerNotasRecientes.mockClear();
  expect(GET(new Request("http://local/api/notas-recientes"))).toBe(corte);
  expect(leerNotasRecientes).not.toHaveBeenCalled();
});
