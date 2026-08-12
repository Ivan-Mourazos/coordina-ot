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
    -- Latido: última vez que la pestaña de un operario avisó "sigo viva"
    -- (fichar/pausar cuenta igual que el aviso periódico, ver guardarFichaje
    -- más abajo). Sirve para cerrar solos los fichajes que se quedan abiertos
    -- porque alguien cerró el portátil sin pausar — ver cerrarPorInactividad
    -- en lib/fichaje.ts y cerrarFichajesSinLatido en server/olanet-worker.ts.
    CREATE TABLE IF NOT EXISTS fichaje_latido (
      operario_id TEXT PRIMARY KEY,
      ultimo      TEXT NOT NULL
    );
    -- Aviso pendiente de "tu fichaje se cerró solo": una fila por operario,
    -- creada cuando cerrarFichajesSinLatido cierra un intervalo suyo. Se lee
    -- y se borra en la misma operación (leerYConsumirAvisoCierre), así que
    -- /api/fichaje solo lo sirve UNA vez, la próxima carga ya no lo repite.
    CREATE TABLE IF NOT EXISTS fichaje_aviso_cierre (
      operario_id TEXT PRIMARY KEY,
      of_ids      TEXT NOT NULL,
      fin         TEXT NOT NULL,
      creado_at   TEXT NOT NULL
    );
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
    CREATE TABLE IF NOT EXISTS aviso_visto (
      operario_id TEXT NOT NULL,
      clave       TEXT NOT NULL,
      visto_at    TEXT NOT NULL,
      PRIMARY KEY (operario_id, clave)
    );
  `);
  prepararClaveIntervalo(db);
  prepararPasadoPor(db);
  prepararTraspasado(db);
  globalThis.__coordinaDb = db;
  return db;
}

/** Quién pasó cada pedido a Producción. La columna se añade sobre la marcha
 *  porque la tabla ya existe en producción, y se rellena hacia atrás desde
 *  `acciones_log`, que lleva registrando el autor de cada "completar" desde el
 *  principio: así el historial también sabe quién pasó los pedidos anteriores
 *  a este cambio. */
function prepararPasadoPor(db: Database.Database): void {
  const columnas = db.prepare("PRAGMA table_info(pedido_overlay)").all() as Array<{ name: string }>;
  if (columnas.some((c) => c.name === "pasado_por")) return;
  db.exec("ALTER TABLE pedido_overlay ADD COLUMN pasado_por TEXT");
  db.exec(`
    UPDATE pedido_overlay SET pasado_por = (
      SELECT l.operario_id FROM acciones_log l
       WHERE l.motivo = 'completar'
         AND json_extract(l.detalle, '$.completarPedidoId') = pedido_overlay.pedido_id
       ORDER BY l.id DESC LIMIT 1
    )
  `);
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

/** Cuándo se confirmó que un tramo ya está imputado en RPS.
 *
 *  Mientras esté a NULL, el tiempo del tramo lo cuenta CoordinaOT; en cuanto se
 *  sella, lo cuenta RPS y deja de sumarse aquí, que es lo que evita contarlo dos
 *  veces cuando el fichaje empiece a subir de verdad (ver traspaso-fichaje.ts).
 *  La columna se añade sobre la marcha: la tabla ya existe en producción y
 *  todo lo de antes queda a NULL, que es justo lo correcto — nada de eso se ha
 *  traspasado nunca. */
function prepararTraspasado(db: Database.Database): void {
  const columnas = db.prepare("PRAGMA table_info(fichaje_intervalo)").all() as Array<{ name: string }>;
  if (columnas.some((c) => c.name === "traspasado_at")) return;
  db.exec("ALTER TABLE fichaje_intervalo ADD COLUMN traspasado_at TEXT");
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

export interface PasoAProduccion {
  at: string; // ISO
  operarioId: string | null;
}

/** Cuándo y quién pasó cada pedido a Producción, por id de pedido. La hora es
 *  la del botón en CoordinaOT, más fiel que la de RPS: la de RPS es cuando
 *  OLANET registró el cambio de estado, y puede ir por detrás. Solo existe
 *  para lo pasado desde aquí. */
export function leerPedidosPasados(): Map<string, PasoAProduccion> {
  const filas = abrir()
    .prepare(
      "SELECT pedido_id, updated_at, pasado_por FROM pedido_overlay WHERE completado = 1",
    )
    .all() as Array<{ pedido_id: string; updated_at: string; pasado_por: string | null }>;
  return new Map(
    filas.map((f) => [f.pedido_id, { at: f.updated_at, operarioId: f.pasado_por }]),
  );
}

export interface Mutacion {
  operarioId: string | null;
  motivo: string;
  cambiosOF?: CambioOF[];
  /** Cómo estaban esas OF antes, según el cliente. Solo se usa para las que
   *  todavía no tienen fila en `of_overlay`: ver `guardarMutacion`. */
  previosOF?: CambioOF[];
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
    INSERT INTO pedido_overlay (pedido_id, completado, updated_at, pasado_por)
    VALUES (?, 1, ?, ?)
    ON CONFLICT(pedido_id) DO UPDATE SET
      completado = 1,
      updated_at = excluded.updated_at,
      pasado_por = excluded.pasado_por
  `);
  const log = db.prepare(
    "INSERT INTO acciones_log (ts, operario_id, motivo, detalle) VALUES (?, ?, ?, ?)",
  );
  // El cliente manda el snapshot NUEVO de cada OF; el anterior solo lo sabe el
  // servidor, y hace falta para poder decir "antes Tamara" en los avisos.
  const leerPrevio = db.prepare(
    "SELECT of_id AS ofId, autor_id AS autorId, revisor_id AS revisorId, estado, observacion FROM of_overlay WHERE of_id = ?",
  );

  // Respaldo del cliente para las OF que aún no tienen fila en el overlay.
  // No es un capricho: RPS trae OF que YA tienen autor (quien las imputó allí)
  // y que CoordinaOT no ha tocado nunca. Sin esto, el primer traspaso de una
  // de ellas no dejaría previo, y por tanto no avisaría a nadie — justo lo
  // contrario del principio de que ningún cambio es silencioso.
  const previoCliente = new Map((m.previosOF ?? []).map((p) => [p.ofId, p]));

  db.transaction(() => {
    // Se lee ANTES de los upserts: después ya solo quedaría el estado nuevo.
    const previos = (m.cambiosOF ?? [])
      .map(
        (c) => (leerPrevio.get(c.ofId) as CambioOF | undefined) ?? previoCliente.get(c.ofId),
      )
      .filter((x): x is CambioOF => x !== undefined);
    for (const c of m.cambiosOF ?? []) upsertOF.run({ ...c, ahora });
    if (m.completarPedidoId) upsertPedido.run(m.completarPedidoId, ahora, m.operarioId);
    log.run(
      ahora,
      m.operarioId,
      m.motivo,
      JSON.stringify({
        cambiosOF: m.cambiosOF ?? [],
        previos,
        completarPedidoId: m.completarPedidoId ?? null,
      }),
    );
  })();
}

export interface AccionLog {
  id: number;
  ts: string;
  operarioId: string | null;
  motivo: string;
  cambiosOF: CambioOF[];
  previos: CambioOF[];
}

/** Movimientos registrados desde `desde` (ISO), del más reciente al más
 *  antiguo. Es la materia prima de los avisos de traspaso: un cambio de manos
 *  no deja marca en la OF, así que solo se puede saber leyendo el registro. */
export function leerAccionesDesde(desde: string): AccionLog[] {
  const filas = abrir()
    .prepare(
      "SELECT id, ts, operario_id, motivo, detalle FROM acciones_log WHERE ts >= ? ORDER BY id DESC",
    )
    .all(desde) as Array<{
    id: number;
    ts: string;
    operario_id: string | null;
    motivo: string;
    detalle: string;
  }>;
  return filas.flatMap((f) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(f.detalle);
    } catch {
      return []; // fila corrupta: se ignora, nunca se propaga a medias
    }
    // JSON.parse("null") o JSON.parse("42") no lanzan: son JSON sintácticamente
    // válido pero no el objeto que se espera. Si no se comprueba aquí, el acceso
    // a d.cambiosOF revienta FUERA del try y tira la lectura ENTERA en vez de
    // descartar solo esta fila (mismo criterio que filaAIntervalo en fichaje-db.ts).
    if (typeof parsed !== "object" || parsed === null) return [];
    const d = parsed as { cambiosOF?: CambioOF[]; previos?: CambioOF[] };
    return [
      {
        id: f.id,
        ts: f.ts,
        operarioId: f.operario_id,
        motivo: f.motivo,
        cambiosOF: d.cambiosOF ?? [],
        previos: d.previos ?? [],
      },
    ];
  });
}

/** Conexión compartida (misma que el flujo). La usan otros módulos de datos
 *  propios, p. ej. fichaje-db.ts, para no duplicar apertura ni esquema. */
export function getDb(): Database.Database {
  return abrir();
}

/** Marca avisos como vistos por un operario.
 *
 *  La clave es la pareja (operario, movimiento) y no una marca de "último
 *  visto": los avisos se apagan de uno en uno, al abrir el pedido al que
 *  pertenecen, y un mismo movimiento le llega a dos personas que lo verán en
 *  momentos distintos. */
export function marcarAvisosVistos(operarioId: string, claves: string[]): void {
  if (claves.length === 0) return;
  const db = abrir();
  const ins = db.prepare(
    "INSERT OR IGNORE INTO aviso_visto (operario_id, clave, visto_at) VALUES (?, ?, ?)",
  );
  const ahora = new Date().toISOString();
  db.transaction(() => {
    for (const clave of claves) ins.run(operarioId, clave, ahora);
  })();
}

export function leerAvisosVistos(operarioId: string): Set<string> {
  const filas = abrir()
    .prepare("SELECT clave FROM aviso_visto WHERE operario_id = ?")
    .all(operarioId) as Array<{ clave: string }>;
  return new Set(filas.map((f) => f.clave));
}
