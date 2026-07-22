import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let route: typeof import("../../app/api/fichaje/route");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-api-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  route = await import("../../app/api/fichaje/route");
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
  return new Request("http://x/api/fichaje", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("POST abre un intervalo y lo devuelve", async () => {
  const res = await route.POST(post({ operarioId: "op-1", ofIds: ["OF-1"], rol: "plantear" }));
  expect(res.status).toBe(200);
  const data = (await res.json()) as { fichaje: { intervalos: unknown[] } };
  expect(data.fichaje.intervalos).toHaveLength(1);
});

test("POST con ofIds vacío pausa (cierra el intervalo abierto)", async () => {
  await route.POST(post({ operarioId: "op-2", ofIds: ["OF-1"], rol: "plantear" }));
  const res = await route.POST(post({ operarioId: "op-2", ofIds: [] }));
  const data = (await res.json()) as { fichaje: { intervalos: { fin: string | null }[] } };
  expect(data.fichaje.intervalos.every((i) => i.fin !== null)).toBe(true);
});

test("GET devuelve el fichaje del operario", async () => {
  await route.POST(post({ operarioId: "op-3", ofIds: ["OF-7"], rol: "revisar" }));
  const res = await route.GET(new Request("http://x/api/fichaje?operarioId=op-3"));
  const data = (await res.json()) as { fichaje: { intervalos: { ofIds: string[] }[] } };
  expect(data.fichaje.intervalos[0].ofIds).toEqual(["OF-7"]);
});

test("POST sin operarioId responde 400", async () => {
  const res = await route.POST(post({ ofIds: [], rol: "plantear" }));
  expect(res.status).toBe(400);
});

test("POST con rol inválido y ofIds no vacío responde 400", async () => {
  const res = await route.POST(post({ operarioId: "op-9", ofIds: ["OF-1"], rol: "xxx" }));
  expect(res.status).toBe(400);
});

test("POST con body JSON no-objeto (null) responde 400, no 500", async () => {
  const req = new Request("http://x/api/fichaje", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "null",
  });
  const res = await route.POST(req);
  expect(res.status).toBe(400);
});
