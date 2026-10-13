import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

// ─── La migración 13: Manuel pasa de Diseño a Impresión ──────────────────────
// Producción ya pasó la siembra de personas (la 7), así que se monta una base
// sellada en la 12 con Manuel todavía en Diseño y un segundo caso a mano.

let dir: string;
let ruta: string;
let estado: typeof import("../server/estado-db");

function baseComoProduccion(): void {
  const db = new Database(ruta);
  db.exec(`CREATE TABLE persona (
    id       TEXT PRIMARY KEY,
    nombre   TEXT NOT NULL,
    pin_hash TEXT,
    roles    TEXT NOT NULL,
    seccion  TEXT,
    activo   INTEGER NOT NULL DEFAULT 1
  )`);
  const ins = db.prepare(
    `INSERT INTO persona (id, nombre, pin_hash, roles, seccion, activo) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  ins.run("manuel", "Manuel", null, "tecnico", "diseno", 1);
  ins.run("carron", "Carrón", null, "tecnico", "diseno", 1);
  db.pragma("user_version = 12");
  db.close();
}

const seccion = (id: string) =>
  (estado.getDb().prepare("SELECT seccion FROM persona WHERE id = ?").get(id) as { seccion: string }).seccion;

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-manuel-"));
  ruta = path.join(dir, "test.db");
  process.env.COORDINA_DB_PATH = ruta;
  baseComoProduccion();
  estado = await import("../server/estado-db");
  estado.getDb();
});

test("Manuel, que seguía en Diseño, pasa a Impresión; Carrón no se toca", () => {
  expect(seccion("manuel")).toBe("impresion");
  expect(seccion("carron")).toBe("diseno");
  expect(estado.getDb().pragma("user_version", { simple: true })).toBe(13);
});

test("si alguien le puso otra sección a mano, esa decisión manda", async () => {
  // Otra base, con Manuel ya movido a mano a OT antes de la 13.
  const ruta2 = path.join(dir, "otra.db");
  const db = new Database(ruta2);
  db.exec(`CREATE TABLE persona (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, pin_hash TEXT,
    roles TEXT NOT NULL, seccion TEXT, activo INTEGER NOT NULL DEFAULT 1)`);
  db.prepare("INSERT INTO persona (id, nombre, roles, seccion) VALUES ('manuel', 'Manuel', 'tecnico', 'ot')").run();
  db.pragma("user_version = 12");
  db.close();
  process.env.COORDINA_DB_PATH = ruta2;
  delete (globalThis as { __coordinaDb?: unknown }).__coordinaDb;
  vi.resetModules();
  const otra = await import("../server/estado-db");
  const fila = otra.getDb().prepare("SELECT seccion FROM persona WHERE id = 'manuel'").get() as { seccion: string };
  expect(fila.seccion).toBe("ot");
});
