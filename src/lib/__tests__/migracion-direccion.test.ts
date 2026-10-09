import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

// ─── La migración 11 sobre una base como la de producción ────────────────────
// Igual que la 9: producción ya pasó la siembra de personas, así que hay que
// probar sobre una base sellada en la 10 y con las filas puestas.

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
  ins.run("ivan", "Iván", "hash-ivan", "tecnico,supervisor", "ot", 1);
  ins.run("jaime", "Jaime", null, "tecnico", "ot", 1);
  ins.run("cris", "Cris", null, "supervisor", null, 0);
  ins.run("carlos", "Carlos", null, "supervisor", null, 0);
  ins.run("esteban", "Esteban", "hash-esteban", "supervisor", null, 0);
  db.pragma("user_version = 10");
  db.close();
}

const fila = (id: string) =>
  estado.getDb().prepare("SELECT roles, activo, pin_hash FROM persona WHERE id = ?").get(id) as {
    roles: string;
    activo: number;
    pin_hash: string | null;
  };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-direccion-"));
  ruta = path.join(dir, "test.db");
  process.env.COORDINA_DB_PATH = ruta;
  baseComoProduccion();
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

test("Carlos y Esteban pasan a Dirección, activos y sin supervisor", () => {
  expect(fila("carlos")).toMatchObject({ roles: "direccion", activo: 1 });
  expect(fila("esteban")).toMatchObject({ roles: "direccion", activo: 1 });
  expect(estado.getDb().pragma("user_version", { simple: true })).toBe(11);
});

test("Iván gana direccion sin perder nada; Cris y Jaime no cambian", () => {
  expect(fila("ivan").roles).toBe("tecnico,supervisor,direccion");
  expect(fila("cris")).toMatchObject({ roles: "supervisor", activo: 0 });
  expect(fila("jaime").roles).toBe("tecnico");
});

test("no toca los PIN", () => {
  expect(fila("ivan").pin_hash).toBe("hash-ivan");
  expect(fila("esteban").pin_hash).toBe("hash-esteban");
});

test("pasarla dos veces deja lo mismo", () => {
  estado.getDb().pragma("user_version = 10");
  delete (globalThis as { __coordinaDb?: unknown }).__coordinaDb;
  vi.resetModules();
  return import("../server/estado-db").then((otra) => {
    otra.getDb();
    const roles = (id: string) =>
      (otra.getDb().prepare("SELECT roles FROM persona WHERE id = ?").get(id) as { roles: string }).roles;
    expect(roles("ivan")).toBe("tecnico,supervisor,direccion");
    expect(roles("carlos")).toBe("direccion");
  });
});
