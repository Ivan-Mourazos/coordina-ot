import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let route: typeof import("../../app/api/fichaje/latido/route");
let fichajeDb: typeof import("../server/fichaje-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-api-latido-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  route = await import("../../app/api/fichaje/latido/route");
  fichajeDb = await import("../server/fichaje-db");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows: better-sqlite3 mantiene el handle del fichero WAL abierto
    // (conexión global cacheada a propósito para reuso en HMR), así que
    // borrar el directorio temporal puede dar EPERM aquí. Limpieza best
    // effort: el SO recicla el temp dir igualmente; no afecta a las aserciones.
  }
});

function post(body: unknown): Request {
  return new Request("http://x/api/fichaje/latido", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("POST registra el latido del operario", async () => {
  const res = await route.POST(post({ operarioId: "op-lat-1" }));
  expect(res.status).toBe(200);
  expect(fichajeDb.leerUltimoLatido("op-lat-1")).not.toBeNull();
});

test("dos latidos seguidos actualizan la misma fila (upsert, no acumula)", async () => {
  await route.POST(post({ operarioId: "op-lat-2" }));
  const primero = fichajeDb.leerUltimoLatido("op-lat-2");
  await new Promise((r) => setTimeout(r, 5));
  await route.POST(post({ operarioId: "op-lat-2" }));
  const segundo = fichajeDb.leerUltimoLatido("op-lat-2");
  expect(segundo).not.toBe(primero);
});

test("sin operarioId responde 400", async () => {
  const res = await route.POST(post({}));
  expect(res.status).toBe(400);
});

test("operarioId vacío responde 400", async () => {
  const res = await route.POST(post({ operarioId: "" }));
  expect(res.status).toBe(400);
});

test("body JSON no-objeto (null) responde 400, no 500", async () => {
  const req = new Request("http://x/api/fichaje/latido", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "null",
  });
  const res = await route.POST(req);
  expect(res.status).toBe(400);
});

test("JSON inválido responde 400", async () => {
  const req = new Request("http://x/api/fichaje/latido", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{no-es-json",
  });
  const res = await route.POST(req);
  expect(res.status).toBe(400);
});
