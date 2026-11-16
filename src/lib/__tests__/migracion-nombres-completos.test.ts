import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";

// ─── Migraciones 18 y 19: nombre y apellido, y Producción completa ───────────
// Base sellada en la 17, como producción: cuentas con el nombre de pila de la
// siembra, una ya corregida a mano y otra sin apellido conocido.

let dir: string;
let estado: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-nombres-"));
  const ruta = path.join(dir, "test.db");
  const db = new Database(ruta);
  db.exec(`CREATE TABLE persona (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, pin_hash TEXT,
    roles TEXT NOT NULL, seccion TEXT, activo INTEGER NOT NULL DEFAULT 1)`);
  const ins = db.prepare("INSERT INTO persona (id, nombre, roles, seccion, activo) VALUES (?, ?, ?, ?, ?)");
  ins.run("carron", "Carrón", "tecnico", "diseno", 1);
  ins.run("alberto", "Alberto", "tecnico", "ot", 1);
  ins.run("jaime", "Jaime V.", "tecnico", "ot", 1); // corregido a mano: no se toca
  ins.run("lucia", "Lucía", "tecnico", "ot", 1); // sin apellido conocido: no se toca
  ins.run("carlos", "Carlos", "direccion", null, 1);
  ins.run("cris", "Cris", "supervisor", null, 0);
  db.pragma("user_version = 17");
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

const fila = (id: string) =>
  estado.getDb().prepare("SELECT nombre, roles, pin_hash, activo FROM persona WHERE id = ?").get(id) as {
    nombre: string;
    roles: string;
    pin_hash: string | null;
    activo: number;
  };

test("las cuentas con el nombre de la siembra pasan a nombre y apellido", () => {
  expect(fila("carron").nombre).toBe("José Luis Carrón");
  expect(fila("alberto").nombre).toBe("Alberto Carbón");
  expect(estado.getDb().pragma("user_version", { simple: true })).toBe(20);
});

test("Carlos Veiga: Dirección y encargado de Producción; Cris sigue desactivada", () => {
  expect(fila("carlos")).toMatchObject({ nombre: "Carlos Veiga", roles: "direccion,produccion", activo: 1 });
  expect(fila("cris")).toMatchObject({ nombre: "Cristina Rivas", activo: 0 });
});

test("un nombre cambiado a mano, o sin apellido conocido, se queda como está", () => {
  expect(fila("jaime").nombre).toBe("Jaime V.");
  expect(fila("lucia").nombre).toBe("Lucía");
});

test("Miguel Tato y Belén Quintela entran en Producción, activos y sin PIN", () => {
  expect(fila("miguel-tato")).toEqual({ nombre: "Miguel Tato", roles: "produccion", pin_hash: null, activo: 1 });
  expect(fila("belen-quintela")).toEqual({ nombre: "Belén Quintela", roles: "produccion", pin_hash: null, activo: 1 });
});
