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

// Iván (29/09/2026): solo cuentan las tareas de Oficina Técnica. La sección de
// cada tarea sale de su recurso en RPS (tarea_maquina) o, si no está, de quién
// la hizo o revisó.
test("una tarea de Diseño devuelta no bloquea la OF aprobada por OT", async () => {
  const db = estadoDb.getDb();
  const alta = db.prepare("INSERT INTO of_overlay (of_id, autor_id, revisor_id, estado, observacion, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
  // Diseño por las personas (manuel).
  alta.run("0230800:5", "ivan", "jaime", "aprobada", null, "2026-09-29T08:00:00Z");
  alta.run("0230800:10", "manuel", "manuel", "devuelta", "Falta el logo", "2026-09-29T10:00:00Z");
  // Diseño por el recurso, aunque la haya tocado alguien de OT: el recurso manda.
  alta.run("0230801:5", null, "jaime", "aprobada", null, "2026-09-29T08:00:00Z");
  alta.run("0230801:10", "ivan", null, "devuelta", "Falta el vinilo", "2026-09-29T10:00:00Z");
  estadoDb.guardarMaquinasDeTarea([["0230801:5", "OTEC-A"], ["0230801:10", "A-DGRA"]]);
  // Una de OT por el recurso y otra sin saber de quién es: la desconocida no cuenta.
  alta.run("0230802:5", null, "tamara", "aprobada", null, "2026-09-29T08:00:00Z");
  alta.run("0230802:7", null, null, "devuelta", "vieja", "2026-09-29T10:00:00Z");
  estadoDb.guardarMaquinasDeTarea([["0230802:5", "A-OTEC"]]);
  // Solo Diseño: para planteamientos no hay nada que contar.
  alta.run("0230803:10", "carron", null, "devuelta", "Otra", "2026-09-29T10:00:00Z");

  const res = await pedir("0230800,0230801,0230802,0230803,0230195");
  expect(await res.json()).toEqual({
    ofs: [
      { of: "0230800", estado: "aprobada", nota: "", actualizado: "2026-09-29T08:00:00Z", revisor: "jaime" },
      { of: "0230801", estado: "aprobada", nota: "", actualizado: "2026-09-29T08:00:00Z", revisor: "jaime" },
      { of: "0230802", estado: "aprobada", nota: "", actualizado: "2026-09-29T08:00:00Z", revisor: "tamara" },
      { of: "0230803", estado: "sin_estado", nota: "", actualizado: null, revisor: "" },
      // Sin recurso ni personas (una OF antigua): sigue funcionando como antes.
      { of: "0230195", estado: "devuelta", nota: "Falta el lado del brazo", actualizado: "2026-09-29T09:00:00Z", revisor: "" },
    ],
  });
});
