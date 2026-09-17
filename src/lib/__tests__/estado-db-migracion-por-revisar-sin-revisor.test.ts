import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

// Decisión de Iván (Task 14): una OF en `por_revisar` SIEMPRE tiene revisor, o
// vuelve al panel de su autor. /api/estado ya cierra la puerta de entrada (ver
// api-estado.test.ts), pero eso no arregla lo que ya estuviera guardado así
// desde antes de esa guarda.
//
// Se monta la base con el esquema VIEJO (sin `revisada`, previo a la
// migración 1) y con OF ya en ese hueco, y se comprueba que el arranque
// siguiente las saca de ahí sin tocar a las demás.

let dir: string;
let db: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-sin-revisor-"));
  const ruta = path.join(dir, "test.db");

  const vieja = new Database(ruta);
  vieja.exec(`
    CREATE TABLE of_overlay (
      of_id       TEXT PRIMARY KEY,
      autor_id    TEXT,
      revisor_id  TEXT,
      estado      TEXT NOT NULL,
      observacion TEXT,
      updated_at  TEXT NOT NULL
    );
    CREATE TABLE acciones_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          TEXT NOT NULL,
      operario_id TEXT,
      motivo      TEXT NOT NULL,
      detalle     TEXT NOT NULL
    );
  `);
  const ins = vieja.prepare(
    "INSERT INTO of_overlay (of_id, autor_id, revisor_id, estado, observacion, updated_at) VALUES (?, ?, ?, ?, NULL, '2026-08-01T00:00:00.000Z')",
  );
  // Con autor: tiene panel al que volver.
  ins.run("of-sin-revisor-con-autor", "jaime", null, "por_revisar");
  // Sin autor NI revisor: no hay panel al que volver, así que va a la bandeja.
  ins.run("of-sin-revisor-ni-autor", null, null, "por_revisar");
  // Control: SÍ tiene revisor, no debe moverse.
  ins.run("of-con-revisor", "jaime", "tamara", "por_revisar");
  // Control: en otro estado, no debe moverse aunque no tenga revisor.
  ins.run("of-en-curso-sin-revisor", "jaime", null, "en_curso");
  vieja.close();

  process.env.COORDINA_DB_PATH = ruta;
  db = await import("../server/estado-db");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

test("una OF sin revisor pero con autor vuelve a su panel (en_curso)", () => {
  const of = db.leerOverlay().ofs.get("of-sin-revisor-con-autor");
  expect(of?.estado).toBe("en_curso");
  expect(of?.autorId).toBe("jaime");
  expect(of?.revisorId).toBeNull();
});

test("una OF sin revisor y sin autor no tiene panel al que volver: a la bandeja", () => {
  const of = db.leerOverlay().ofs.get("of-sin-revisor-ni-autor");
  expect(of?.estado).toBe("pendiente");
  expect(of?.autorId).toBeNull();
  expect(of?.revisorId).toBeNull();
});

test("la que ya tenía revisor no se toca", () => {
  const of = db.leerOverlay().ofs.get("of-con-revisor");
  expect(of?.estado).toBe("por_revisar");
  expect(of?.revisorId).toBe("tamara");
});

test("otro estado sin revisor no es cosa de esta migración", () => {
  const of = db.leerOverlay().ofs.get("of-en-curso-sin-revisor");
  expect(of?.estado).toBe("en_curso");
});

test("migrar dos veces no rompe nada (ya no queda ninguna por arreglar)", () => {
  expect(() => db.getDb()).not.toThrow();
  expect(db.leerOverlay().ofs.get("of-sin-revisor-con-autor")?.estado).toBe("en_curso");
});
