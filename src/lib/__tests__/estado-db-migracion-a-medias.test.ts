import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

// Una migración que añade una columna Y la rellena son DOS pasos, y el segundo
// puede fallar. Pasó de verdad: se desplegó una vez con el relleno mal escrito,
// el `ALTER` entró y el relleno reventó. Como la marca de "ya está hecho" era
// "¿existe la columna?", desde entonces cada arranque salía por la puerta de
// atrás y el relleno no volvía a intentarse nunca: la base se quedaba a medias,
// en silencio, con el histórico leyéndose como "aprobada sin revisión".
//
// Aquí se monta exactamente esa base —columna puesta, `user_version` sin
// sellar, la marca a 0 en una OF que sí pasó por revisión— y se comprueba que
// el arranque siguiente la repara sola.

let dir: string;
let db: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-medias-"));
  const ruta = path.join(dir, "test.db");

  const aMedias = new Database(ruta);
  aMedias.exec(`
    CREATE TABLE of_overlay (
      of_id       TEXT PRIMARY KEY,
      autor_id    TEXT,
      revisor_id  TEXT,
      estado      TEXT NOT NULL,
      observacion TEXT,
      updated_at  TEXT NOT NULL,
      revisada    INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE acciones_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          TEXT NOT NULL,
      operario_id TEXT,
      motivo      TEXT NOT NULL,
      detalle     TEXT NOT NULL
    );
  `);
  aMedias
    .prepare(
      "INSERT INTO of_overlay (of_id, autor_id, revisor_id, estado, observacion, updated_at, revisada) VALUES (?, 'ivan', 'tamara', ?, NULL, '2026-08-10T06:31:12.973Z', 0)",
    )
    .run("of-revisada-de-verdad", "aprobada");
  // Ésta nunca se revisó: se aprobó sin revisión. Tiene que SEGUIR a 0, o el
  // arreglo estaría mintiendo en la otra dirección.
  aMedias
    .prepare(
      "INSERT INTO of_overlay (of_id, autor_id, revisor_id, estado, observacion, updated_at, revisada) VALUES (?, 'ivan', NULL, ?, NULL, '2026-08-10T06:31:12.973Z', 0)",
    )
    .run("of-sin-revisar", "aprobada");

  // Con la columna puesta pero el relleno sin correr, `user_version` sigue a 0:
  // ésa es la firma de una base a medias.
  if (aMedias.pragma("user_version", { simple: true }) !== 0)
    throw new Error("el molde de la prueba no es una base a medias");
  aMedias.close();

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

test("la base a medias se rellena sola en el arranque siguiente", () => {
  const ofs = db.leerOverlay().ofs;
  expect(ofs.get("of-revisada-de-verdad")?.revisada).toBe(true);
});

test("y el arreglo no marca de más: lo aprobado sin revisar sigue sin marca", () => {
  expect(db.leerOverlay().ofs.get("of-sin-revisar")?.revisada).toBe(false);
});

test("queda sellada, para no repetir el relleno en cada arranque", () => {
  // Sin el sello, el relleno correría en cada reinicio: sobre una base grande
  // es trabajo por gusto, y peor, volvería a marcar lo que alguien hubiera
  // corregido a mano.
  //
  // Se compara con ">= 1" y no con un número exacto a propósito: el sello es
  // el de la ÚLTIMA migración aplicada, así que sube cada vez que se añade
  // una. Lo que este test defiende es que la de `revisada` quedó sellada, no
  // cuántas hay.
  expect(db.getDb().pragma("user_version", { simple: true })).toBeGreaterThanOrEqual(1);
});
