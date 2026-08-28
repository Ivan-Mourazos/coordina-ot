import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

// "Quién pasó el pedido a Producción" se rellenó hacia atrás desde el registro,
// y arrastraba el mismo problema que `revisada`: la marca de "hecho" era que
// existiera la columna, así que un corte entre el ALTER y el relleno lo dejaba
// vacío PARA SIEMPRE, y en silencio. Nadie se habría enterado: un historial sin
// nombres no se distingue de un historial de pedidos que pasó gente sin apuntar.
//
// Se monta esa base —columna puesta, sin sellar, con huecos— y se comprueba que
// el arranque siguiente la rellena. Y lo otro que importa: que NO reescribe lo
// que ya tenía nombre, que sería cambiar un dato bueno por uno deducido.

let dir: string;
let db: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-pasado-"));
  const ruta = path.join(dir, "test.db");

  const vieja = new Database(ruta);
  vieja.exec(`
    CREATE TABLE pedido_overlay (
      pedido_id  TEXT PRIMARY KEY,
      completado INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      pasado_por TEXT
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
    "INSERT INTO pedido_overlay (pedido_id, completado, updated_at, pasado_por) VALUES (?, 1, '2026-08-10T06:31:12.973Z', ?)",
  );
  ins.run("ped-con-hueco", null);
  // Éste ya tiene nombre, y en el registro figura OTRO. Si el relleno
  // reescribiera en vez de rellenar huecos, aquí se vería.
  ins.run("ped-ya-puesto", "tamara");

  const log = vieja.prepare(
    "INSERT INTO acciones_log (ts, operario_id, motivo, detalle) VALUES (?, ?, 'completar', ?)",
  );
  log.run("2026-08-10T06:00:00.000Z", "ivan", JSON.stringify({ completarPedidoId: "ped-con-hueco" }));
  log.run("2026-08-10T06:05:00.000Z", "angel", JSON.stringify({ completarPedidoId: "ped-ya-puesto" }));
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

test("el hueco se rellena con quien lo pasó, según el registro", () => {
  expect(db.leerPedidosPasados().get("ped-con-hueco")?.operarioId).toBe("ivan");
});

test("y lo que ya tenía nombre NO se reescribe", () => {
  // En el registro pone "angel"; en la tabla estaba "tamara". Manda la tabla:
  // un dato guardado no se pisa con uno deducido.
  expect(db.leerPedidosPasados().get("ped-ya-puesto")?.operarioId).toBe("tamara");
});
