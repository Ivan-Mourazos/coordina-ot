import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let route: typeof import("../../app/api/integracion/ofs/route");
let estadoDb: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-api-integracion-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  route = await import("../../app/api/integracion/ofs/route");
  estadoDb = await import("../server/estado-db");
});

afterAll(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* WAL abierto en Windows */ }
});

beforeEach(() => {
  process.env.INTEGRACION_CLAVE = "clave-de-prueba";
  const db = estadoDb.getDb();
  db.prepare("DELETE FROM of_overlay").run();
  const alta = db.prepare("INSERT INTO of_overlay (of_id, estado, observacion, updated_at, revisor_id) VALUES (?, ?, ?, ?, ?)");
  alta.run("0230194:5", "aprobada", null, "2026-09-29T08:00:00Z", "jaime");
  alta.run("0230195:5", "devuelta", "Falta el lado del brazo", "2026-09-29T09:00:00Z", null);
  alta.run("0230700:1", "aprobada", null, "2026-09-29T08:00:00Z", null);
  alta.run("0230700:6", "en_revision", "interna", "2026-09-29T07:00:00Z", null);
});

const pedir = (ofs: string, clave: string | null = "clave-de-prueba") =>
  route.GET(new Request(`http://x/api/integracion/ofs?ofs=${encodeURIComponent(ofs)}`, {
    headers: clave === null ? {} : { "X-Clave-Integracion": clave },
  }));

test("sin clave o con clave mala: 401 y nada de datos", async () => {
  for (const res of [await pedir("0230194", null), await pedir("0230194", "otra")]) {
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain("aprobada");
  }
});

test("sin INTEGRACION_CLAVE configurada: 503", async () => {
  delete process.env.INTEGRACION_CLAVE;
  expect((await pedir("0230194")).status).toBe(503);
});

test("lista inválida: 400", async () => {
  expect((await pedir("0230194,abc")).status).toBe(400);
});

test("responde cada OF con solo sus cinco campos", async () => {
  const res = await pedir("0230194,0230195,0230700,0239999");
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.json()).toEqual({
    ofs: [
      { of: "0230194", estado: "aprobada", nota: "", actualizado: "2026-09-29T08:00:00Z", revisor: "jaime" },
      { of: "0230195", estado: "devuelta", nota: "Falta el lado del brazo", actualizado: "2026-09-29T09:00:00Z", revisor: "" },
      { of: "0230700", estado: "en_revision", nota: "", actualizado: "2026-09-29T08:00:00Z", revisor: "" },
      { of: "0239999", estado: "sin_estado", nota: "", actualizado: null, revisor: "" },
    ],
  });
});
