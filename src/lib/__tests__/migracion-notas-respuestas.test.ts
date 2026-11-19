import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";

// ─── Migraciones 21 y 22: respuestas y la fecha que faltaba ──────────────────
// Base en la 20 como la dejó el primer borrador (nota_audiencia sin
// creado_at): la 21 añade las columnas de las respuestas y la 22 repara.

let dir: string;
let estado: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-respuestas-"));
  const ruta = path.join(dir, "test.db");
  const db = new Database(ruta);
  db.exec(`CREATE TABLE nota_pedido (id INTEGER PRIMARY KEY AUTOINCREMENT, pedido TEXT NOT NULL,
    operario_id TEXT NOT NULL, texto TEXT NOT NULL, creado_at TEXT NOT NULL, editado_at TEXT,
    borrado_at TEXT, publica INTEGER NOT NULL DEFAULT 0, en_consulta_publica INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE nota_audiencia (nota_id INTEGER NOT NULL, tipo TEXT NOT NULL, destino TEXT NOT NULL,
      PRIMARY KEY (nota_id, tipo, destino));
    INSERT INTO nota_pedido (id, pedido, operario_id, texto, creado_at) VALUES (1, 'AR.1', 'ivan', 'x', '2026-11-01T09:00:00.000Z');
    INSERT INTO nota_audiencia VALUES (1, 'seccion', 'ot');`);
  db.pragma("user_version = 20");
  db.close();
  process.env.COORDINA_DB_PATH = ruta;
  estado = await import("../server/estado-db");
  estado.getDb();
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

const columnas = (tabla: string) =>
  (estado.getDb().prepare(`PRAGMA table_info(${tabla})`).all() as { name: string }[]).map((c) => c.name);

test("sella la 22", () => {
  expect(estado.getDb().pragma("user_version", { simple: true })).toBe(24);
});

test("la 21 añade lo de las respuestas", () => {
  expect(columnas("nota_pedido")).toEqual(expect.arrayContaining(["padre_id", "raiz_id", "resuelta_at", "resuelta_por"]));
});

test("la 22 pone creado_at a la audiencia, NULL en lo que ya había (no avisa)", () => {
  expect(columnas("nota_audiencia")).toContain("creado_at");
  expect(estado.getDb().prepare("SELECT creado_at FROM nota_audiencia WHERE nota_id = 1").get()).toEqual({ creado_at: null });
});
