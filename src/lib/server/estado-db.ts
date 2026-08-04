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
    CREATE TABLE IF NOT EXISTS fichaje_intervalo (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      operario_id TEXT NOT NULL,
      of_ids      TEXT NOT NULL,
      rol         TEXT NOT NULL,
      inicio      TEXT NOT NULL,
      fin         TEXT,
      updated_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fichaje_operario ON fichaje_intervalo(operario_id);
    -- Cuántos intervalos de cada operario están ya enteros en la cola de
    -- salida. Solo el ÚLTIMO intervalo puede seguir abierto y cambiar, así que
    -- todo lo anterior es inmutable y no hace falta volver a derivarlo en cada
    -- fichaje. Sin esto, cada pulsación reprocesaba el histórico completo.
    CREATE TABLE IF NOT EXISTS olanet_watermark (
      operario_id TEXT PRIMARY KEY,
      procesados  INTEGER NOT NULL
    );
    -- Cola de salida hacia OLANET (patrón outbox). El fichaje se cierra aquí y
    -- se empuja después: si la VPN o el servidor de OLANET no responden, no se
    -- pierde nada y se reintenta.
    --
    -- Los dos tipos de evento ('bono' y 'fase') comparten tabla A PROPÓSITO:
    -- el orden importa. Las líneas de tiempo tienen que estar puestas antes de
    -- marcar la fase como finalizada, porque es ese estado el que dispara el
    -- traspaso a RPS; en dos colas separadas no habría forma de garantizarlo.
    --
    -- 'clave' es la clave natural del evento y su UNIQUE es lo que hace que
    -- volver a derivar los mismos intervalos no duplique nada.
    CREATE TABLE IF NOT EXISTS olanet_pendiente (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo        TEXT NOT NULL,
      clave       TEXT NOT NULL UNIQUE,
      operario_id TEXT NOT NULL,
      datos       TEXT NOT NULL,
      creado_at   TEXT NOT NULL,
      enviado_at  TEXT,
      error       TEXT,
      intentos    INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_olanet_pendiente ON olanet_pendiente(enviado_at, id);
  `);
  prepararClaveIntervalo(db);
  globalThis.__coordinaDb = db;
  return db;
}

/** (operario, inicio) identifica un intervalo: es lo que permite guardar el
 *  fichaje por lo alto en vez de reescribir el histórico entero (ver
 *  guardarFichaje). El índice se crea aparte porque una BD anterior puede
 *  tener duplicados: dos acciones en el mismo milisegundo dejan un intervalo
 *  de duración cero junto al bueno. Se conserva el de id mayor, que es el
 *  real; el de duración cero no aporta tiempo a ninguna OF. */
function prepararClaveIntervalo(db: Database.Database): void {
  db.exec(`
    DELETE FROM fichaje_intervalo
     WHERE id NOT IN (
       SELECT MAX(id) FROM fichaje_intervalo GROUP BY operario_id, inicio
     );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_fichaje_intervalo
      ON fichaje_intervalo(operario_id, inicio);
  `);
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

/** Cuándo se marcó cada pedido como pasado a Producción (ISO), por id de
 *  pedido. Es la hora a la que alguien pulsó el botón en CoordinaOT, que es
 *  más fiel que la de RPS: la de RPS es cuando OLANET registró el cambio de
 *  estado, y puede ir por detrás. Solo existe para lo pasado desde aquí. */
export function leerPedidosPasadosAt(): Map<string, string> {
  const filas = abrir()
    .prepare("SELECT pedido_id, updated_at FROM pedido_overlay WHERE completado = 1")
    .all() as Array<{ pedido_id: string; updated_at: string }>;
  return new Map(filas.map((f) => [f.pedido_id, f.updated_at]));
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

/** Conexión compartida (misma que el flujo). La usan otros módulos de datos
 *  propios, p. ej. fichaje-db.ts, para no duplicar apertura ni esquema. */
export function getDb(): Database.Database {
  return abrir();
}
