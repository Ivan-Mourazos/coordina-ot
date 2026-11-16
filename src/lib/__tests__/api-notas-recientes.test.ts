import { beforeEach, expect, test, vi } from "vitest";

// La campana pide sus avisos con el lector de la sesión: qué notas van con
// cada uno lo decide la base (notas-db, probado aparte). Aquí solo se mira que
// la ruta pase el lector correcto y no mande nada sin él.

const { lectorDePeticion, leerAvisosNotas, soloConSesion } = vi.hoisted(() => ({
  lectorDePeticion: vi.fn(),
  leerAvisosNotas: vi.fn(),
  soloConSesion: vi.fn(),
}));
vi.mock("../server/sesion", () => ({ soloConSesion }));
vi.mock("../server/lector-sesion", () => ({ lectorDePeticion }));
vi.mock("../server/notas-db", () => ({ leerAvisosNotas }));
import { GET } from "../../app/api/notas-recientes/route";
import { VENTANA_AVISOS_DIAS } from "../avisos";

beforeEach(() => {
  soloConSesion.mockReturnValue(null);
  leerAvisosNotas.mockReset();
  leerAvisosNotas.mockReturnValue([{ id: 7, operarioId: "ivan" }]);
});

test("devuelve los avisos del lector de la sesión, sin caché", async () => {
  const lector = { id: "belen", destinos: ["persona:belen", "seccion:produccion"] };
  lectorDePeticion.mockReturnValue(lector);
  const r = GET(new Request("http://local/api/notas-recientes"));
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(leerAvisosNotas).toHaveBeenCalledWith(lector, VENTANA_AVISOS_DIAS);
  const d = await r.json();
  expect(d.avisos.map((n: { id: number }) => n.id)).toEqual([7]);
  expect(d.destinos).toEqual(lector.destinos);
});

test("sin lector (login apagado) no hay avisos", async () => {
  lectorDePeticion.mockReturnValue(null);
  expect((await GET(new Request("http://local/api/notas-recientes")).json()).avisos).toEqual([]);
  expect(leerAvisosNotas).not.toHaveBeenCalled();
});

test("sin sesión no se leen notas", () => {
  const corte = new Response(null, { status: 401 });
  soloConSesion.mockReturnValue(corte);
  expect(GET(new Request("http://local/api/notas-recientes"))).toBe(corte);
  expect(leerAvisosNotas).not.toHaveBeenCalled();
});
