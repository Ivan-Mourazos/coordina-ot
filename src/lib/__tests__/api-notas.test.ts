import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { NotaPedido } from "../nota-pedido";

let dir: string;
let ruta: typeof import("../../app/api/notas/route");
let estado: typeof import("../server/estado-db");
let notasDb: typeof import("../server/notas-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-api-notas-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  estado = await import("../server/estado-db");
  notasDb = await import("../server/notas-db");
  ruta = await import("../../app/api/notas/route");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

beforeEach(() => {
  estado.getDb().prepare("DELETE FROM nota_pedido").run();
});

const post = (body: unknown) =>
  ruta.POST(new Request("http://x/api/notas", { method: "POST", body: JSON.stringify(body) }));
const patch = (body: unknown) =>
  ruta.PATCH(new Request("http://x/api/notas", { method: "PATCH", body: JSON.stringify(body) }));
const del = (body: unknown) =>
  ruta.DELETE(new Request("http://x/api/notas", { method: "DELETE", body: JSON.stringify(body) }));
const get = (q: string) => ruta.GET(new Request(`http://x/api/notas?${q}`));

test("POST crea la nota y la devuelve ya recortada", async () => {
  const res = await post({ pedido: "AR.26.03914", operarioId: "jaime", texto: "  falta el color  " });
  expect(res.status).toBe(200);
  const { nota } = (await res.json()) as { nota: NotaPedido };
  expect(nota.texto).toBe("falta el color");
  expect(nota.operarioId).toBe("jaime");
  expect(nota.id).toBeGreaterThan(0);
});

test("GET devuelve el hilo del pedido que se pide y nada más", async () => {
  notasDb.crearNota("AR.1", "jaime", "primera", "2026-08-24T09:00:00.000Z");
  notasDb.crearNota("AR.2", "ivan", "otra", "2026-08-24T09:00:00.000Z");
  const res = await get("pedido=AR.1");
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const { notas } = (await res.json()) as { notas: NotaPedido[] };
  expect(notas.map((n) => n.texto)).toEqual(["primera"]);
});

test("GET sin pedido es 400", async () => {
  expect((await get("")).status).toBe(400);
});

test("POST rechaza la nota vacía y dice por qué", async () => {
  const res = await post({ pedido: "AR.1", operarioId: "jaime", texto: "   " });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: string }).error).toMatch(/vac/i);
});

test("POST rechaza la nota demasiado larga y lo dice distinto", async () => {
  const res = await post({ pedido: "AR.1", operarioId: "jaime", texto: "a".repeat(2001) });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: string }).error).toMatch(/larga/i);
});

test("POST sin operarioId es 400", async () => {
  expect((await post({ pedido: "AR.1", texto: "hola" })).status).toBe(400);
});

test("POST sin pedido es 400", async () => {
  expect((await post({ operarioId: "jaime", texto: "hola" })).status).toBe(400);
});

test("un cuerpo que no es JSON es 400 y no un 500", async () => {
  const res = await ruta.POST(new Request("http://x/api/notas", { method: "POST", body: "{{{" }));
  expect(res.status).toBe(400);
});

test("PATCH cambia la mía", async () => {
  const n = notasDb.crearNota("AR.1", "jaime", "antes", "2026-08-24T09:00:00.000Z");
  const res = await patch({ id: n.id, operarioId: "jaime", texto: "después" });
  expect(res.status).toBe(200);
  expect(notasDb.leerNotas("AR.1")[0].texto).toBe("después");
});

test("PATCH sobre la de otro es 403 y no la toca", async () => {
  const n = notasDb.crearNota("AR.1", "jaime", "mía", "2026-08-24T09:00:00.000Z");
  const res = await patch({ id: n.id, operarioId: "ivan", texto: "te la cambio" });
  expect(res.status).toBe(403);
  expect(notasDb.leerNotas("AR.1")[0].texto).toBe("mía");
});

test("DELETE quita la mía", async () => {
  const n = notasDb.crearNota("AR.1", "jaime", "fuera", "2026-08-24T09:00:00.000Z");
  expect((await del({ id: n.id, operarioId: "jaime" })).status).toBe(200);
  expect(notasDb.leerNotas("AR.1")).toEqual([]);
});

test("DELETE sobre la de otro es 403 y no la toca", async () => {
  const n = notasDb.crearNota("AR.1", "jaime", "mía", "2026-08-24T09:00:00.000Z");
  expect((await del({ id: n.id, operarioId: "ivan" })).status).toBe(403);
  expect(notasDb.leerNotas("AR.1")).toHaveLength(1);
});

test("PATCH o DELETE con un id que no es número es 400", async () => {
  expect((await patch({ id: "ocho", operarioId: "jaime", texto: "x" })).status).toBe(400);
  expect((await del({ id: null, operarioId: "jaime" })).status).toBe(400);
});
