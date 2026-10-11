import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// ─── /api/revision/pasos ─────────────────────────────────────────────────────
// Los técnicos mantienen los pasos desde el menú. Apagado el login se puede
// sin identidad (como las causas); encendido, Dirección los lee y no los toca.

let dir: string;
let s: typeof import("../server/sesion");
let ruta: typeof import("../../app/api/revision/pasos/route");
let db: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-api-pasos-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.COORDINA_SESION_SECRET = "secreto-de-pruebas";
  process.env.COORDINA_LOGIN = "off";
  s = await import("../server/sesion");
  ruta = await import("../../app/api/revision/pasos/route");
  db = await import("../server/estado-db");
  db.getDb();
});

afterEach(() => {
  process.env.COORDINA_LOGIN = "off";
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

const pide = (method: "GET" | "POST" | "PATCH", body?: unknown, cookie?: string, url = "http://x/api/revision/pasos") =>
  new Request(url, {
    method,
    headers: cookie ? { cookie } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const medidas = () => db.leerCausasDevolucion().find((c) => c.etiqueta === "Medidas")!.id;
const corte = () => db.leerCausasDevolucion().find((c) => c.etiqueta === "Corte")!.id;

test("se añade un paso común y otro de familia, cada uno al final de su grupo", async () => {
  const r1 = await ruta.POST(pide("POST", { texto: "La fecha de entrega", causaId: medidas() }));
  expect(r1.status).toBe(200);
  const comun = ((await r1.json()) as { paso: { familia: string | null } }).paso;
  expect(comun.familia).toBeNull();

  const r2 = await ruta.POST(pide("POST", { texto: "Salida del toldo", causaId: medidas(), familia: "TOLDO" }));
  const toldo = ((await r2.json()) as { paso: { familia: string; orden: number } }).paso;
  expect(toldo).toMatchObject({ familia: "TOLDO", orden: 1 });
});

test("sin causa que exista, no se crea", async () => {
  expect((await ruta.POST(pide("POST", { texto: "Algo que mirar", causaId: 9999 }))).status).toBe(400);
  expect((await ruta.POST(pide("POST", { texto: "Algo que mirar" }))).status).toBe(400);
  expect((await ruta.POST(pide("POST", { texto: "x", causaId: medidas() }))).status).toBe(400);
});

test("se cambia la causa, se pasa a común y se retira", async () => {
  const r = await ruta.POST(pide("POST", { texto: "Las piezas del corte", causaId: medidas(), familia: "LONA" }));
  const { id } = ((await r.json()) as { paso: { id: number } }).paso;

  const e = await ruta.PATCH(pide("PATCH", { id, causaId: corte(), familia: null }));
  expect(((await e.json()) as { paso: unknown }).paso).toMatchObject({ causaId: corte(), familia: null });

  await ruta.PATCH(pide("PATCH", { id, retirado: true }));
  const activos = ((await (await ruta.GET(pide("GET"))).json()) as { pasos: { id: number }[] }).pasos;
  expect(activos.map((p) => p.id)).not.toContain(id);
  const todos = ((await (await ruta.GET(pide("GET", undefined, undefined, "http://x/api/revision/pasos?todos=1"))).json()) as {
    pasos: { id: number; retirado: boolean }[];
  }).pasos;
  expect(todos.find((p) => p.id === id)?.retirado).toBe(true);
});

test("con el login encendido, Dirección los lee pero no los cambia", async () => {
  process.env.COORDINA_LOGIN = "activo";
  const carlos = `${s.COOKIE}=${s.firmarSesion("carlos")}`;
  expect((await ruta.GET(pide("GET", undefined, carlos))).status).toBe(200);
  expect((await ruta.POST(pide("POST", { texto: "Otro paso", causaId: medidas() }, carlos))).status).toBe(403);
  expect((await ruta.PATCH(pide("PATCH", { id: 1, retirado: true }, carlos))).status).toBe(403);
  expect((await ruta.GET(pide("GET"))).status).toBe(401);
});
