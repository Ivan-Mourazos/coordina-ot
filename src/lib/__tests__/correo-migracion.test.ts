import { afterAll, expect, test } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "coordina-correo-migracion-"));
afterAll(() => {
  globalThis.__coordinaDb?.close();
  globalThis.__coordinaDb = undefined;
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
});

test("añade las copias a una cola antigua sin cambiar destinatarios ni perder filas; se puede repetir", async () => {
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  const antigua = new Database(process.env.COORDINA_DB_PATH);
  // Esquema anterior, incluso antes de añadir el cuerpo HTML: ambas mejoras
  // deben poder estrenarse a la vez sin tocar el correo que ya estaba pendiente.
  antigua.exec(`CREATE TABLE planteamiento_correo (
    id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id TEXT NOT NULL,
    ficheros TEXT NOT NULL, para TEXT NOT NULL, asunto TEXT, cuerpo TEXT,
    estado TEXT NOT NULL, intentos INTEGER NOT NULL DEFAULT 0, error TEXT,
    modo TEXT, pasado_por TEXT, creado_at TEXT NOT NULL, proximo_at TEXT, enviado_at TEXT
  )`);
  antigua.prepare(`INSERT INTO planteamiento_correo
    (pedido_id, ficheros, para, asunto, cuerpo, estado, modo, creado_at, proximo_at)
    VALUES (?, '[]', ?, 'Asunto original', 'Cuerpo original', 'pendiente', 'activo', ?, ?)`)
    .run("AR.26.05016", '["produccion@toldosgomez.com"]', "2026-10-14T09:00:00Z", "2026-10-14T09:00:00Z");
  antigua.close();

  const { getDb } = await import("../server/estado-db");
  const { leerCorreosDe, correosParaEnviar } = await import("../server/correo-cola");
  for (let apertura = 0; apertura < 2; apertura++) {
    expect(leerCorreosDe("AR.26.05016")).toHaveLength(1);
    expect(correosParaEnviar(new Date("2026-10-15T09:00:00Z"))[0]).toMatchObject({
      cc: [], para: ["produccion@toldosgomez.com"], asunto: "Asunto original", cuerpo: "Cuerpo original", html: null,
    });
    expect(getDb().prepare("SELECT cc, autores FROM planteamiento_correo").get()).toEqual({ cc: "[]", autores: "[]" });
    getDb().close();
    globalThis.__coordinaDb = undefined;
  }
});
