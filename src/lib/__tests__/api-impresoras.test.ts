import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { VistaImpresora } from "../impresoras";

const PRODUCCION = "ipp://192.168.4.245/ipp";

vi.mock("../server/impresoras", () => ({
  impresorasDeLaCasa: () => [
    { id: "produccion", uri: PRODUCCION },
    { id: "ot", uri: "ipp://192.168.4.249/ipp" },
  ],
  leerImpresoras: async (): Promise<VistaImpresora[]> => [{
    id: "produccion", nombre: "Producción", modelo: null, estado: "libre", avisos: [], tonerBajo: [], papeles: ["A4"],
    pendientes: [{ id: 501, nombre: "Planteamiento AR.26.00002", usuario: "Coordina", estado: "en_cola", creado: null }],
    recientes: [{ id: 500, nombre: "Planteamiento AR.26.00001", usuario: "Coordina", estado: "abortado", creado: null }],
  }],
}));

let dir: string;
let route: typeof import("../../app/api/impresoras/route");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-impresoras-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  route = await import("../../app/api/impresoras/route");
  const { getDb } = await import("../server/estado-db");
  const ins = getDb().prepare(
    `INSERT INTO planteamiento_impresion (pedido_id, fichero, paginas, estado, trabajo_ipp, impresora, modo, creado_at, enviado_at)
     VALUES (?, ?, 1, ?, ?, ?, 'activo', '2026-11-04T08:00:00Z', ?)`,
  );
  ins.run("AR.26.00001", "a.pdf", "enviado", 500, PRODUCCION, "2026-11-04T08:00:00Z");
  ins.run("AR.26.00002", "b.pdf", "enviado", 501, PRODUCCION, "2026-11-04T08:05:00Z");
  ins.run("AR.26.00003", "c.pdf", "manual", null, null, null);
  ins.run("AR.26.00004", null, "sin_planteamiento", null, null, null);
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

test("cada envío lleva lo que dice la impresora de su trabajo", async () => {
  const res = await route.GET(new Request("http://x/api/impresoras"));
  const d = (await res.json()) as { envios: Array<{ pedidoId: string; impresoraId: string | null; estadoEnImpresora: string | null; estado: string }> };
  const de = (p: string) => d.envios.find((e) => e.pedidoId === p);
  expect(de("AR.26.00001")).toMatchObject({ impresoraId: "produccion", estadoEnImpresora: "abortado" });
  expect(de("AR.26.00002")).toMatchObject({ impresoraId: "produccion", estadoEnImpresora: "en_cola" });
  expect(de("AR.26.00003")).toMatchObject({ estado: "manual", impresoraId: null, estadoEnImpresora: null });
  // «Sin planteamiento» no es un envío: no sale en la lista.
  expect(de("AR.26.00004")).toBeUndefined();
});
