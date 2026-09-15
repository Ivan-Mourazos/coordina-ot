import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let s: typeof import("../server/sesion");
let historial: typeof import("../../app/api/historial/route");
let publico: typeof import("../../app/api/publico/pedidos/route");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-lecturas-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.COORDINA_SESION_SECRET = "secreto-de-pruebas";
  process.env.COORDINA_LOGIN = "activo";
  process.env.DATASOURCE = "mock";
  s = await import("../server/sesion");
  historial = await import("../../app/api/historial/route");
  publico = await import("../../app/api/publico/pedidos/route");
});

afterAll(() => {
  process.env.COORDINA_LOGIN = "activo";
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

test("sin sesión, el historial del equipo NO se lee", async () => {
  const res = await historial.GET(new Request("http://x/api/historial"));
  expect(res.status).toBe(401);
});

test("con sesión de técnico, el historial se lee como siempre", async () => {
  const res = await historial.GET(
    new Request("http://x/api/historial", {
      headers: { cookie: `coordina_sesion=${s.firmarSesion("tamara")}` },
    }),
  );
  expect(res.status).toBe(200);
});

test("la consulta pública sigue abierta: es su motivo de existir", async () => {
  const res = await publico.GET(new Request("http://x/api/publico/pedidos"));
  expect(res.status).toBe(200);
});

test("con el login APAGADO no cambia nada de lo de hoy", async () => {
  process.env.COORDINA_LOGIN = "off";
  const res = await historial.GET(new Request("http://x/api/historial"));
  expect(res.status).toBe(200);
  process.env.COORDINA_LOGIN = "activo";
});
