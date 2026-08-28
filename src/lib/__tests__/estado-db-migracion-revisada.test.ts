import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

// La columna `revisada` se añade sobre una BD que ya existe en producción, así
// que lo que hay que probar es el RELLENO HACIA ATRÁS: sin él, todo lo aprobado
// hasta hoy pasaría a leerse como "Aprobada sin revisión", que es la misma
// mentira del revés.
//
// Por eso el fichero monta la BD a mano con el esquema VIEJO (sin la columna),
// la cierra, y solo entonces importa `estado-db`, que es quien migra al abrir.

let dir: string;
let db: typeof import("../server/estado-db");

const fila = (ofId: string, estado: string, revisorId: string | null) => ({
  ofId,
  estado,
  revisorId,
});

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-migr-"));
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
    "INSERT INTO of_overlay (of_id, autor_id, revisor_id, estado, observacion, updated_at) VALUES (?, 'ivan', ?, ?, NULL, '2026-08-01T00:00:00.000Z')",
  );
  for (const f of [
    fila("of-aprobada-con-revisor", "aprobada", "tamara"),
    fila("of-aprobada-sin-revisor", "aprobada", null),
    fila("of-devuelta", "devuelta", "tamara"),
    fila("of-en-revision", "en_revision", "tamara"),
    fila("of-por-revisar", "por_revisar", "tamara"),
    fila("of-en-curso", "en_curso", null),
    // La que solo el registro puede salvar: hoy está en curso y sin revisor,
    // pero en su día pasó por revisión (la reabrieron y se la quedó el autor).
    fila("of-reabierta", "en_curso", null),
  ])
    ins.run(f.ofId, f.revisorId, f.estado);

  vieja
    .prepare("INSERT INTO acciones_log (ts, operario_id, motivo, detalle) VALUES (?, ?, ?, ?)")
    .run(
      "2026-07-01T10:00:00.000Z",
      "tamara",
      "accion",
      JSON.stringify({
        cambiosOF: [
          { ofId: "of-reabierta", autorId: "ivan", revisorId: "tamara", estado: "en_revision" },
        ],
        previos: [],
        completarPedidoId: null,
      }),
    );
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

test("el relleno hacia atrás no convierte el histórico en 'sin revisión'", () => {
  const ofs = db.leerOverlay().ofs;
  const revisada = (id: string) => ofs.get(id)?.revisada;

  // Estados a los que solo se llega pasando por la revisión.
  expect(revisada("of-en-revision")).toBe(true);
  expect(revisada("of-devuelta")).toBe(true);
  expect(revisada("of-aprobada-con-revisor")).toBe(true);

  // El registro alcanza donde el estado de hoy ya no dice nada.
  expect(revisada("of-reabierta")).toBe(true);
});

test("no marca como revisado lo que nadie llegó a mirar", () => {
  const ofs = db.leerOverlay().ofs;

  // El caso del agujero: revisor nombrado y esperando en la cola. Tener nombre
  // puesto no es haber sido revisada.
  expect(ofs.get("of-por-revisar")?.revisada).toBe(false);
  // Aprobada por "Dar por bueno sin revisión": nunca hubo revisor.
  expect(ofs.get("of-aprobada-sin-revisor")?.revisada).toBe(false);
  expect(ofs.get("of-en-curso")?.revisada).toBe(false);
});

test("migrar dos veces no rompe nada (la columna ya está)", () => {
  // `abrir()` corre en cada arranque del servidor; el guard de PRAGMA es lo que
  // evita que el ALTER reviente la segunda vez.
  expect(() => db.getDb()).not.toThrow();
  expect(db.leerOverlay().ofs.get("of-devuelta")?.revisada).toBe(true);
});
