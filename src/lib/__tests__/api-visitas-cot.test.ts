import { expect, test } from "vitest";
import { GET } from "../../app/api/visitas-cot/route";

test("GET devuelve las visitas pendientes desde el fallback mock", async () => {
  const res = await GET(
    new Request("http://x/api/visitas-cot?ambito=pendientes&page=0"),
  );
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const data = (await res.json()) as {
    visitas: Array<{ estado: string }>;
    hasMore: boolean;
    refreshedAt: string;
  };
  expect(data.visitas.length).toBeGreaterThan(0);
  expect(data.visitas.every((visita) => visita.estado === "pendiente")).toBe(
    true,
  );
  expect(typeof data.hasMore).toBe("boolean");
  expect(Number.isNaN(Date.parse(data.refreshedAt))).toBe(false);
});

test("GET historial admite búsqueda y fechas", async () => {
  const res = await GET(
    new Request(
      "http://x/api/visitas-cot?ambito=historial&q=cliente&desde=2026-07-01&hasta=2026-07-31",
    ),
  );
  expect(res.status).toBe(200);
  const data = (await res.json()) as {
    visitas: Array<{ idOrden: string; estado: string }>;
  };
  expect(data.visitas).toEqual([
    expect.objectContaining({ idOrden: "OM-COT-005", estado: "cerrada" }),
  ]);
});

test("GET normaliza ámbito y página inválidos", async () => {
  const res = await GET(
    new Request("http://x/api/visitas-cot?ambito=otro&page=-10"),
  );
  expect(res.status).toBe(200);
  const data = (await res.json()) as {
    visitas: Array<{ estado: string }>;
  };
  expect(data.visitas.every((visita) => visita.estado === "pendiente")).toBe(
    true,
  );
});
