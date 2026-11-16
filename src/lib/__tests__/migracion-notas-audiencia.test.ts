import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { lectorDe } from "../server/lector-notas";

// ─── Migración 20: audiencia y menciones de las notas ────────────────────────
// Base sellada en la 19 con una nota «solo OT» y otra «para todos»: ninguna
// gana ni pierde lectores.

let dir: string;
let estado: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-audiencia-"));
  const ruta = path.join(dir, "test.db");
  const db = new Database(ruta);
  db.exec(`CREATE TABLE nota_pedido (id INTEGER PRIMARY KEY AUTOINCREMENT, pedido TEXT NOT NULL,
    operario_id TEXT NOT NULL, texto TEXT NOT NULL, creado_at TEXT NOT NULL, editado_at TEXT,
    borrado_at TEXT, publica INTEGER NOT NULL DEFAULT 0)`);
  const ins = db.prepare("INSERT INTO nota_pedido (id, pedido, operario_id, texto, creado_at, publica) VALUES (?, ?, ?, ?, ?, ?)");
  ins.run(1, "AR.1", "jaime", "interna", "2026-11-01T09:00:00.000Z", 0);
  ins.run(2, "AR.1", "jaime", "para todos", "2026-11-01T09:00:00.000Z", 1);
  db.pragma("user_version = 19");
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

const audiencia = (id: number) =>
  (estado.getDb().prepare("SELECT destino FROM nota_audiencia WHERE nota_id = ? AND tipo = 'seccion' ORDER BY destino").all(id) as { destino: string }[]).map((f) => f.destino);
const enConsulta = (id: number) =>
  (estado.getDb().prepare("SELECT en_consulta_publica AS c FROM nota_pedido WHERE id = ?").get(id) as { c: number }).c;

test("sella la 20", () => {
  expect(estado.getDb().pragma("user_version", { simple: true })).toBe(20);
});

test("la «solo OT» sigue siendo para OT, Diseño, Impresión y Dirección, y fuera de la consulta", () => {
  expect(audiencia(1)).toEqual(["direccion", "diseno", "impresion", "ot"]);
  expect(enConsulta(1)).toBe(0);
  // Sin fecha: no son notas «para ti» y no deben sonar en la campana.
  expect(estado.getDb().prepare("SELECT COUNT(*) AS n FROM nota_audiencia WHERE creado_at IS NOT NULL").get()).toEqual({ n: 0 });
});

test("la «para todos» queda sin restricción y en la consulta pública", () => {
  expect(audiencia(2)).toEqual([]);
  expect(enConsulta(2)).toBe(1);
});

test("las notas viejas no traen menciones", () => {
  expect(estado.getDb().prepare("SELECT COUNT(*) AS n FROM nota_mencion").get()).toEqual({ n: 0 });
});

test("lector: sección propia y las de tambienEn", () => {
  expect(lectorDe({ id: "manuel", roles: ["tecnico"], seccion: "impresion" }).destinos).toEqual([
    "persona:manuel",
    "seccion:impresion",
    "seccion:diseno",
  ]);
});

test("lector: Producción y Dirección salen de los roles", () => {
  expect(lectorDe({ id: "carlos", roles: ["direccion", "produccion"], seccion: null })).toEqual({
    id: "carlos",
    destinos: ["persona:carlos", "seccion:produccion", "seccion:direccion"],
  });
});
