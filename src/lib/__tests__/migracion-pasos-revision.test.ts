import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

// ─── La migración 12 sobre la lista de producción (11/10/2026) ───────────────
// Los pasos de revisión dejan de ser la «cara positiva» de una causa y pasan a
// su propia tabla; las causas quedan en seis globales (decisión de Iván tras
// leer las 204 devoluciones). Se prueba con las causas TAL CUAL están en el
// servidor, incluidas las retiradas, y con marcas de revisión en curso.

let dir: string;
let ruta: string;
let estado: typeof import("../server/estado-db");

function baseComoProduccion(): void {
  const db = new Database(ruta);
  db.exec(`
    CREATE TABLE causa_devolucion (
      id INTEGER PRIMARY KEY AUTOINCREMENT, etiqueta TEXT NOT NULL, clave TEXT NOT NULL,
      retirada INTEGER NOT NULL DEFAULT 0, creada_at TEXT NOT NULL, creada_por TEXT,
      familia TEXT, mira TEXT, orden INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX ux_causa_devolucion_clave ON causa_devolucion(clave);
    CREATE TABLE marca_revision (
      of_id TEXT NOT NULL, punto_id INTEGER NOT NULL, estado TEXT NOT NULL,
      operario_id TEXT, at TEXT NOT NULL, PRIMARY KEY (of_id, punto_id)
    );
  `);
  const ins = db.prepare(
    `INSERT INTO causa_devolucion (id, etiqueta, clave, retirada, creada_at, familia, mira, orden)
     VALUES (?, ?, ?, ?, '2026-08-01', ?, ?, ?)`,
  );
  ins.run(1, "Error en medidas", "error en medidas", 0, null, "Las medidas del trabajo", 1);
  ins.run(2, "Error en cotas", "error en cotas", 0, null, "Las cotas del croquis", 2);
  ins.run(3, "Material equivocado", "material equivocado", 0, null, "El material apuntado", 3);
  ins.run(4, "Notas", "notas", 0, null, null, 4);
  ins.run(5, "Modelo equivocado", "modelo equivocado", 0, "TOLDO", "Modelo seleccionado", 1);
  ins.run(10, "Faltan piezas en el corte", "faltan piezas en el corte", 1, "LONA", "Todas las piezas en el corte", 6);
  ins.run(24, "Faltan Anotacións", "faltan anotacions", 0, null, null, 5);
  const marca = db.prepare("INSERT INTO marca_revision (of_id, punto_id, estado, at) VALUES (?, ?, ?, '2026-10-10')");
  marca.run("0232817:5", 1, "bien");
  marca.run("0232817:5", 5, "falla");
  db.pragma("user_version = 11");
  db.close();
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-pasos-"));
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

const causa = (clave: string) =>
  estado.getDb().prepare("SELECT id, etiqueta, familia, retirada FROM causa_devolucion WHERE clave = ?").get(clave) as
    | { id: number; etiqueta: string; familia: string | null; retirada: number }
    | undefined;

test("quedan las seis causas globales, comunes a todos los pedidos", () => {
  const activas = estado.leerCausasDevolucion().map((c) => c.etiqueta);
  expect(activas).toEqual([
    "Medidas",
    "Documentación incompleta",
    "Material y acabados",
    "Corte",
    "Elementos y accesorios",
    "Modelo y colocación",
  ]);
  expect(estado.leerCausasDevolucion().every((c) => c.familia === null)).toBe(true);
});

test("las de antes se renombran con su mismo id: las devoluciones viejas siguen contando", () => {
  expect(causa("medidas")?.id).toBe(1);
  expect(causa("material y acabados")?.id).toBe(3);
  expect(causa("documentacion incompleta")?.id).toBe(4);
  expect(causa("modelo y colocacion")).toMatchObject({ id: 5, familia: null });
  expect(causa("error en cotas")?.retirada).toBe(1);
  expect(causa("faltan anotacions")?.retirada).toBe(1);
});

test("los pasos que había pasan a su tabla, cada uno con su causa", () => {
  const pasos = estado.leerPasosRevision(true);
  const de = (texto: string) => pasos.find((p) => p.texto === texto);
  expect(de("Las medidas del trabajo")).toMatchObject({ familia: null, causaId: 1, retirado: false });
  expect(de("Las cotas del croquis")).toMatchObject({ causaId: 1 }); // su causa se retira: va a Medidas
  expect(de("El material apuntado")).toMatchObject({ causaId: 3 });
  expect(de("Modelo seleccionado")).toMatchObject({ familia: "TOLDO", causaId: 5 });
  expect(de("Todas las piezas en el corte")).toMatchObject({ familia: "LONA", retirado: true, causaId: causa("corte")!.id });
});

test("las marcas de revisión en curso siguen apuntando a su paso", () => {
  const pasos = estado.leerPasosRevision(true);
  const medidas = pasos.find((p) => p.texto === "Las medidas del trabajo")!.id;
  const modelo = pasos.find((p) => p.texto === "Modelo seleccionado")!.id;
  expect(estado.leerMarcasRevision(["0232817:5"])["0232817:5"]).toEqual({ [medidas]: "bien", [modelo]: "falla" });
});

test("pasarla dos veces deja lo mismo", () => {
  const antes = estado.leerPasosRevision(true).length;
  estado.getDb().pragma("user_version = 11");
  delete (globalThis as { __coordinaDb?: unknown }).__coordinaDb;
  vi.resetModules();
  return import("../server/estado-db").then((otra) => {
    otra.getDb();
    expect(otra.leerPasosRevision(true)).toHaveLength(antes);
    expect(otra.leerCausasDevolucion()).toHaveLength(6);
  });
});
