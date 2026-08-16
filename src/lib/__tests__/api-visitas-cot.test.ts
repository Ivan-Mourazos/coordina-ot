import { expect, test } from "vitest";
import { GET } from "../../app/api/visitas-cot/route";
import { sumarDias } from "../fechas";
import { hoyISO } from "../types";

// El mock de visitas se mueve con el calendario a propósito (ver ANCLA_VISITAS
// en visitas-cot-db.ts): si no, al mes siguiente la agenda de simulación sale
// entera atrasada y no se parece a un día normal. Así que las ventanas de fecha
// de estas pruebas se calculan desde HOY igual que hace el mock. Con fechas
// fijas, el test pasaba en julio de 2026 y empezó a fallar solo en agosto.
const haceDias = (n: number) => sumarDias(hoyISO(), -n);

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
      `http://x/api/visitas-cot?ambito=historial&q=cliente&desde=${haceDias(30)}&hasta=${hoyISO()}`,
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
