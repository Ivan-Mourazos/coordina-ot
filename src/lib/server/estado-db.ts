import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ESTADOS_OF, type CambioOF, type Overlay } from "./overlay";

// ─── BD propia de CoordinaOT (SQLite) ────────────────────────────────────────
// Guarda el estado del flujo de OT que RPS no conoce. Fichero único en
// COORDINA_DB_PATH (por defecto ./data/coordina.db); backup = copiar fichero.
// SOLO servidor. WAL para que lecturas y escrituras no se bloqueen entre sí.

const DB_PATH =
  process.env.COORDINA_DB_PATH ?? path.join(process.cwd(), "data", "coordina.db");

declare global {
  // Reutiliza la conexión entre recargas de módulo (HMR en dev).
  var __coordinaDb: Database.Database | undefined;
}

function abrir(): Database.Database {
  if (globalThis.__coordinaDb) return globalThis.__coordinaDb;
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS of_overlay (
      of_id       TEXT PRIMARY KEY,
      autor_id    TEXT,
      revisor_id  TEXT,
      estado      TEXT NOT NULL,
      observacion TEXT,
      updated_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pedido_overlay (
      pedido_id  TEXT PRIMARY KEY,
      completado INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS acciones_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          TEXT NOT NULL,
      operario_id TEXT,
      motivo      TEXT NOT NULL,
      detalle     TEXT NOT NULL
    );
  `);
  globalThis.__coordinaDb = db;
  return db;
}

export function leerOverlay(): Overlay {
  const db = abrir();
  const ofs = new Map<string, CambioOF>();
  for (const fila of db
    .prepare(
      "SELECT of_id, autor_id, revisor_id, estado, observacion FROM of_overlay",
    )
    .all() as Array<{
    of_id: string;
    autor_id: string | null;
    revisor_id: string | null;
    estado: string;
    observacion: string | null;
  }>) {
    if (!ESTADOS_OF.has(fila.estado)) continue; // fila corrupta: ignorar
    ofs.set(fila.of_id, {
      ofId: fila.of_id,
      autorId: fila.autor_id,
      revisorId: fila.revisor_id,
      estado: fila.estado as CambioOF["estado"],
      observacion: fila.observacion,
    });
  }
  const pedidosCompletados = new Set<string>(
    (
      db
        .prepare("SELECT pedido_id FROM pedido_overlay WHERE completado = 1")
        .all() as Array<{ pedido_id: string }>
    ).map((f) => f.pedido_id),
  );
  return { ofs, pedidosCompletados };
}

export interface Mutacion {
  operarioId: string | null;
  motivo: string;
  cambiosOF?: CambioOF[];
  completarPedidoId?: string;
}

/** Aplica una mutación completa en una transacción y la deja en el log. */
export function guardarMutacion(m: Mutacion): void {
  const db = abrir();
  const ahora = new Date().toISOString();
  const upsertOF = db.prepare(`
    INSERT INTO of_overlay (of_id, autor_id, revisor_id, estado, observacion, updated_at)
    VALUES (@ofId, @autorId, @revisorId, @estado, @observacion, @ahora)
    ON CONFLICT(of_id) DO UPDATE SET
      autor_id = excluded.autor_id,
      revisor_id = excluded.revisor_id,
      estado = excluded.estado,
      observacion = excluded.observacion,
      updated_at = excluded.updated_at
  `);
  const upsertPedido = db.prepare(`
    INSERT INTO pedido_overlay (pedido_id, completado, updated_at)
    VALUES (?, 1, ?)
    ON CONFLICT(pedido_id) DO UPDATE SET completado = 1, updated_at = excluded.updated_at
  `);
  const log = db.prepare(
    "INSERT INTO acciones_log (ts, operario_id, motivo, detalle) VALUES (?, ?, ?, ?)",
  );

  db.transaction(() => {
    for (const c of m.cambiosOF ?? []) upsertOF.run({ ...c, ahora });
    if (m.completarPedidoId) upsertPedido.run(m.completarPedidoId, ahora);
    log.run(
      ahora,
      m.operarioId,
      m.motivo,
      JSON.stringify({
        cambiosOF: m.cambiosOF ?? [],
        completarPedidoId: m.completarPedidoId ?? null,
      }),
    );
  })();
}
