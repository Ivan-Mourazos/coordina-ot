import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ESTADOS_OF, type CambioOF, type Overlay } from "./overlay";
import { claveDeCausa } from "../devolucion";
import type { MovimientoRegistrado } from "../metricas";

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
    CREATE TABLE IF NOT EXISTS nota_pedido (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido      TEXT NOT NULL,
      operario_id TEXT NOT NULL,
      texto       TEXT NOT NULL,
      creado_at   TEXT NOT NULL,
      editado_at  TEXT,
      borrado_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_nota_pedido ON nota_pedido(pedido);
    CREATE TABLE IF NOT EXISTS pedido_scan (
      pedido        TEXT PRIMARY KEY,
      -- mtime del PDF que alguien ya dio por visto: la referencia contra la
      -- que se compara. NULL mientras no se haya mirado el fichero ni una vez.
      mtime_visto   INTEGER,
      -- Último mtime que vio el vigilante.
      mtime_actual  INTEGER,
      -- Cuándo entró este pedido en la lista de vigilados.
      registrado_at TEXT NOT NULL,
      -- Cuándo se le miró el PDF por última vez (haya cambiado o no): es lo
      -- que ordena a quién le toca el siguiente vistazo.
      revisado_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pedido_scan_revisado ON pedido_scan(revisado_at);
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
    -- Por qué vuelve una OF al autor. La lista NO está en el código: se crea
    -- sobre la marcha desde la propia devolución, porque cerrarla de antemano
    -- exigía adivinar hoy las causas que van a hacer falta.
    --
    -- La columna clave es la etiqueta normalizada (ver claveDeCausa) y va con
    -- índice único: dos personas creando "Error en cotas" y "error en cotas" a la vez
    -- acaban en la MISMA fila, que es lo que permite contarlas después.
    --
    -- No se borran, se RETIRAN: las devoluciones guardan el id, y borrar la
    -- causa dejaría el histórico apuntando a la nada.
    CREATE TABLE IF NOT EXISTS causa_devolucion (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      etiqueta   TEXT NOT NULL,
      clave      TEXT NOT NULL,
      retirada   INTEGER NOT NULL DEFAULT 0,
      creada_at  TEXT NOT NULL,
      creada_por TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_causa_devolucion_clave
      ON causa_devolucion(clave);
    -- Cuándo salió cada entrada del log de novedades.
    --
    -- No va escrita en el código porque al escribir las novedades no se sabe
    -- qué día van a salir, y ponerla a mano significa acordarse de corregirla
    -- antes de desplegar. Se sella la PRIMERA vez que el servidor arranca con
    -- esa entrada dentro, y a partir de ahí no se mueve: reconstruir o
    -- reiniciar no puede cambiar la fecha de algo que ya salió.
    CREATE TABLE IF NOT EXISTS novedad_publicada (
      novedad_id   TEXT PRIMARY KEY,
      publicada_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS aviso_visto (
      operario_id TEXT NOT NULL,
      clave       TEXT NOT NULL,
      visto_at    TEXT NOT NULL,
      PRIMARY KEY (operario_id, clave)
    );
  `);
  prepararClaveIntervalo(db);
  prepararTraspasado(db);
  migrar(db);
  globalThis.__coordinaDb = db;
  return db;
}

/** Quién pasó cada pedido a Producción. La columna se añade sobre la marcha
 *  porque la tabla ya existe en producción, y se rellena hacia atrás desde
 *  `acciones_log`, que lleva registrando el autor de cada "completar" desde el
 *  principio: así el historial también sabe quién pasó los pedidos anteriores
 *  a este cambio.
 *
 *  El relleno solo toca los HUECOS (`pasado_por IS NULL`). Sin ese filtro,
 *  volver a pasar por aquí reescribiría los que ya están, y un pedido cuyo
 *  "completar" no esté en el registro —porque se purgue, o porque se guardó con
 *  otro motivo— perdería el nombre que sí tenía. Rellenar huecos se puede
 *  repetir sin miedo; reescribirlo todo, no. */
function pasadoPor(db: Database.Database): void {
  const columnas = db.prepare("PRAGMA table_info(pedido_overlay)").all() as Array<{ name: string }>;
  if (!columnas.some((c) => c.name === "pasado_por"))
    db.exec("ALTER TABLE pedido_overlay ADD COLUMN pasado_por TEXT");
  db.exec(`
    UPDATE pedido_overlay SET pasado_por = (
      SELECT l.operario_id FROM acciones_log l
       WHERE l.motivo = 'completar'
         AND json_extract(l.detalle, '$.completarPedidoId') = pedido_overlay.pedido_id
       ORDER BY l.id DESC LIMIT 1
    )
    WHERE pasado_por IS NULL
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

/** "Esta OF pasó por revisión". La columna se añade sobre la marcha porque la
 *  tabla ya existe en producción, y se rellena hacia atrás por dos vías:
 *
 *  1. El registro de acciones, que es la fuente buena: cada mutación guarda el
 *     snapshot de las OF que tocó, así que cualquier paso por `en_revision`
 *     dejó rastro ahí.
 *  2. Para lo que el registro no alcance, la regla vieja: tener revisor
 *     nombrado Y estar en un estado al que solo se llega pasando por revisión
 *     (`devuelta` sale de "Devolver con nota", `aprobada` de "Aprobar").
 *     `por_revisar` queda FUERA a propósito: ahí hay revisor nombrado pero
 *     todavía no la ha mirado nadie, que es justo el caso que se arregla.
 *
 *  Sin este relleno, todo lo aprobado hasta hoy pasaría a leerse como
 *  "Aprobada sin revisión", que es la misma mentira del revés.
 *
 *  POR QUÉ NO VALE "¿existe la columna?" COMO MARCA DE HECHO, y por qué va
 *  todo en una transacción: son dos pasos, y el segundo puede fallar. Pasó de
 *  verdad —el relleno se desplegó una vez con el SQL mal escrito—: el `ALTER`
 *  entró, el relleno reventó, y a partir de ahí la columna ya estaba, así que
 *  cada arranque salía por la puerta de atrás y el relleno no volvía a
 *  intentarse NUNCA. La base quedaba a medias, en silencio y para siempre,
 *  con todo el histórico leyéndose como "aprobada sin revisión".
 *
 *  La marca es `user_version`, que solo se sella cuando el relleno ha
 *  terminado. Y como va dentro de la transacción, o entran las dos cosas o no
 *  entra ninguna: una base a medias vuelve a intentarlo sola en el siguiente
 *  arranque, que es justo lo que arregla las que ya se quedaron así. */
function revisada(db: Database.Database): void {
  const columnas = db.prepare("PRAGMA table_info(of_overlay)").all() as Array<{ name: string }>;
  // La columna puede estar ya de un intento anterior que se quedó a medias.
  if (!columnas.some((c) => c.name === "revisada"))
    db.exec("ALTER TABLE of_overlay ADD COLUMN revisada INTEGER NOT NULL DEFAULT 0");
  db.exec(`
    UPDATE of_overlay SET revisada = 1
     WHERE of_id IN (
       SELECT json_extract(c.value, '$.ofId')
         FROM acciones_log l, json_each(l.detalle, '$.cambiosOF') c
        WHERE json_extract(c.value, '$.estado') = 'en_revision'
     );
    UPDATE of_overlay SET revisada = 1
     WHERE revisada = 0
       AND revisor_id IS NOT NULL
       AND estado IN ('en_revision', 'devuelta', 'aprobada');
  `);
}

// ─── Las migraciones con relleno, y cómo se sabe cuáles faltan ───────────────
// Añadir una columna y RELLENARLA son dos pasos, y el segundo puede fallar. Si
// la marca de "ya está hecho" es "¿existe la columna?", un fallo entre medias
// deja la columna puesta y el relleno sin correr: a partir de ahí cada arranque
// sale por la puerta de atrás y no se reintenta nunca. Pasó de verdad con
// `revisada`, y el histórico se quedó leyéndose como "aprobada sin revisión".
//
// Así que la marca es `user_version`, que se sella AL FINAL y dentro de la
// misma transacción que el relleno: o entran las dos cosas o no entra ninguna.
// Una base que se quedó a medias vuelve a intentarlo sola en el arranque
// siguiente.
//
// REGLAS PARA AÑADIR UNA:
//  · Al final de la lista y con el número siguiente. NO se renumera lo que ya
//    está: hay bases por ahí selladas con esos números.
//  · Que se pueda repetir sin estropear nada. Puede correr en una base donde ya
//    se hizo a mano, o a medias. Rellenar huecos, no reescribir.
//
// Las que solo añaden una columna (`prepararTraspasado`) no hacen falta aquí:
// sin relleno no hay nada que pueda quedarse a medias.
const MIGRACIONES: ReadonlyArray<{
  version: number;
  nombre: string;
  aplicar: (db: Database.Database) => void;
}> = [
  { version: 1, nombre: "revisada", aplicar: revisada },
  // Estaba fuera, con la guarda de columna, y arrastraba el mismo problema: si
  // su relleno se hubiera cortado, el "quién pasó el pedido" del historial se
  // habría quedado vacío para siempre y sin avisar. Entra aquí para que se
  // repare solo. Rellena únicamente los huecos, así que en una base sana no
  // cambia nada.
  { version: 2, nombre: "pasado_por", aplicar: pasadoPor },
  // Las tres de arranque, para que la lista no salga vacía el primer día: con
  // ninguna delante, quien devuelve no entiende qué se le pide y tira de la
  // nota libre. Son a propósito GENÉRICAS —"error en medidas" y no "el largo
  // 2 cm"—: lo específico va en la nota, y las que falten se crean al usarlas.
  { version: 3, nombre: "causas_devolucion", aplicar: causasDeArranque },
];

const CAUSAS_ARRANQUE = ["Error en medidas", "Error en cotas", "Material equivocado"];

/** Siembra las causas de devolución del primer día.
 *
 *  `ON CONFLICT DO NOTHING` sobre la clave: si alguien ya creó "Error en
 *  cotas" a mano antes de que esto corra, se respeta la suya —con su id, al
 *  que ya pueden apuntar devoluciones— en vez de duplicarla. */
function causasDeArranque(db: Database.Database): void {
  const ahora = new Date().toISOString();
  const ins = db.prepare(
    `INSERT INTO causa_devolucion (etiqueta, clave, creada_at, creada_por)
     VALUES (?, ?, ?, NULL)
     ON CONFLICT(clave) DO NOTHING`,
  );
  for (const etiqueta of CAUSAS_ARRANQUE) ins.run(etiqueta, claveDeCausa(etiqueta), ahora);
}

/** Pone al día el esquema. Cada migración va en su transacción y sella su
 *  número; la siguiente arranca solo si la anterior entró. */
function migrar(db: Database.Database): void {
  const hecho = () => db.pragma("user_version", { simple: true }) as number;
  for (const m of MIGRACIONES) {
    if (hecho() >= m.version) continue;
    db.transaction(() => {
      m.aplicar(db);
      db.pragma(`user_version = ${m.version}`);
    })();
  }
}

/** Los movimientos que cuentan para las métricas de rechazo, del registro.
 *
 *  Del REGISTRO y no del estado de las OF: `observacion` guarda solo la
 *  última devolución de cada una, así que una OF que vuelve tres veces
 *  contaría una — y en cuanto se aprueba deja de parecer devuelta. Ver la
 *  cabecera de lib/metricas.ts.
 *
 *  Se filtra por motivo EN SQL y se desdobla el JSON con `json_each`: el
 *  registro lo guarda todo (asignaciones, traspasos, fichajes) y traérselo
 *  entero a memoria para tirar el 90 % sería trabajo por gusto.
 *
 *  `desde`/`hasta` son ISO y opcionales. `hasta` se compara con `<` sobre el
 *  día siguiente en quien llama: aquí llega ya listo.
 */
export function leerMovimientosMetricas(
  desde?: string,
  hasta?: string,
): MovimientoRegistrado[] {
  // Los movimientos del ciclo que se miden. `recuperar_planteo` entra aunque no
  // se cuente: cancela la espera en la cola, y sin él una OF recuperada seguiria
  // sumando espera hasta que alguien la mirase meses despues.
  const filtros = [
    "l.motivo IN ('devolver','empezar_revision','anular','terminar_planteo','aprobar','aprobar_corregida','recuperar_planteo')",
  ];
  const args: string[] = [];
  if (desde) {
    filtros.push("l.ts >= ?");
    args.push(desde);
  }
  if (hasta) {
    filtros.push("l.ts < ?");
    args.push(hasta);
  }
  const filas = abrir()
    .prepare(
      `SELECT l.ts AS at,
              l.motivo AS motivo,
              json_extract(c.value, '$.ofId') AS ofId,
              json_extract(c.value, '$.observacion') AS observacion
         FROM acciones_log l, json_each(l.detalle, '$.cambiosOF') c
        WHERE ${filtros.join(" AND ")}
        ORDER BY l.ts`,
    )
    .all(...args) as MovimientoRegistrado[];
  return filas;
}
/** La fecha de salida de cada entrada del log, sellando las que no la tengan.
 *
 *  Se llama al servirlas, no al arrancar: da igual el momento exacto —lo que
 *  importa es que sea la primera vez— y así no hay que acordarse de encadenar
 *  otra cosa al arranque.
 *
 *  `INSERT OR IGNORE`: si ya está, no se toca. Es lo que hace que la fecha no
 *  se mueva nunca, ni al reconstruir ni al reiniciar.
 *
 *  Ojo con una rareza esperada: cada base sella la suya, así que en desarrollo
 *  se ven fechas distintas a las del servidor. Es correcto —cada instalación
 *  estrenó la versión cuando la estrenó— y no afecta a nadie: el log que lee el
 *  equipo es el del servidor. */
export function fechasDeNovedades(ids: readonly string[]): Record<string, string> {
  if (ids.length === 0) return {};
  const db = abrir();
  const ahora = new Date().toISOString();
  const ins = db.prepare(
    "INSERT OR IGNORE INTO novedad_publicada (novedad_id, publicada_at) VALUES (?, ?)",
  );
  db.transaction(() => {
    for (const id of ids) ins.run(id, ahora);
  })();

  const filas = db
    .prepare(
      `SELECT novedad_id, publicada_at FROM novedad_publicada
        WHERE novedad_id IN (${ids.map(() => "?").join(",")})`,
    )
    .all(...ids) as Array<{ novedad_id: string; publicada_at: string }>;
  return Object.fromEntries(filas.map((f) => [f.novedad_id, f.publicada_at]));
}

export interface CausaDevolucion {
  id: number;
  etiqueta: string;
  /** Retirada = ya no se ofrece al devolver, pero sigue existiendo para que
   *  las devoluciones que la usaron se puedan leer. */
  retirada: boolean;
}

/** Las causas de devolución. Con `incluirRetiradas` salen todas, que es lo
 *  que hace falta para PINTAR una devolución vieja; sin ello, solo las que se
 *  ofrecen al devolver hoy. */
export function leerCausasDevolucion(incluirRetiradas = false): CausaDevolucion[] {
  const filas = abrir()
    .prepare(
      `SELECT id, etiqueta, retirada FROM causa_devolucion
        ${incluirRetiradas ? "" : "WHERE retirada = 0"}
        ORDER BY etiqueta COLLATE NOCASE`,
    )
    .all() as Array<{ id: number; etiqueta: string; retirada: number }>;
  return filas.map((f) => ({ id: f.id, etiqueta: f.etiqueta, retirada: f.retirada === 1 }));
}

/** Crea una causa, o devuelve la que ya decía lo mismo.
 *
 *  NO falla cuando ya existe, y es a propósito: dos revisores pueden crear
 *  "Error en cotas" y "error en cotas" con segundos de diferencia, y lo que
 *  tiene que pasar es que acaben usando la misma —si no, la lista se
 *  deshilacha y las métricas dejan de contar—. Ninguno de los dos se entera,
 *  que es lo correcto: los dos querían lo mismo.
 *
 *  Si la que existía estaba RETIRADA, vuelve a activarse: alguien la necesita
 *  otra vez, y crear una gemela dejaría el histórico partido en dos.
 */
export function crearCausaDevolucion(
  etiqueta: string,
  operarioId: string | null,
): CausaDevolucion {
  const db = abrir();
  const limpia = etiqueta.trim();
  const clave = claveDeCausa(limpia);
  return db.transaction(() => {
    const ya = db
      .prepare("SELECT id, etiqueta, retirada FROM causa_devolucion WHERE clave = ?")
      .get(clave) as { id: number; etiqueta: string; retirada: number } | undefined;
    if (ya) {
      if (ya.retirada === 1)
        db.prepare("UPDATE causa_devolucion SET retirada = 0 WHERE id = ?").run(ya.id);
      return { id: ya.id, etiqueta: ya.etiqueta, retirada: false };
    }
    const r = db
      .prepare(
        `INSERT INTO causa_devolucion (etiqueta, clave, creada_at, creada_por)
         VALUES (?, ?, ?, ?)`,
      )
      .run(limpia, clave, new Date().toISOString(), operarioId);
    return { id: Number(r.lastInsertRowid), etiqueta: limpia, retirada: false };
  })();
}

/** Retira una causa (o la devuelve al servicio). No se borra nunca: las
 *  devoluciones guardan su id, y borrarla dejaría el histórico apuntando a la
 *  nada. */
export function retirarCausaDevolucion(id: number, retirada: boolean): boolean {
  return (
    abrir()
      .prepare("UPDATE causa_devolucion SET retirada = ? WHERE id = ?")
      .run(retirada ? 1 : 0, id).changes > 0
  );
}
export function leerOverlay(): Overlay {
  const db = abrir();
  const ofs = new Map<string, CambioOF>();
  for (const fila of db
    .prepare(
      "SELECT of_id, autor_id, revisor_id, estado, observacion, revisada FROM of_overlay",
    )
    .all() as Array<{
    of_id: string;
    autor_id: string | null;
    revisor_id: string | null;
    estado: string;
    observacion: string | null;
    revisada: number;
  }>) {
    if (!ESTADOS_OF.has(fila.estado)) continue; // fila corrupta: ignorar
    ofs.set(fila.of_id, {
      ofId: fila.of_id,
      autorId: fila.autor_id,
      revisorId: fila.revisor_id,
      estado: fila.estado as CambioOF["estado"],
      observacion: fila.observacion,
      revisada: fila.revisada === 1,
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
  // `revisada` NO viene del cliente: se deduce aquí de que el estado que llega
  // sea `en_revision`, y el MAX la hace de una sola dirección —una vez que
  // alguien la revisó, eso ya pasó y ningún movimiento posterior lo borra—.
  const upsertOF = db.prepare(`
    INSERT INTO of_overlay (of_id, autor_id, revisor_id, estado, observacion, updated_at, revisada)
    VALUES (@ofId, @autorId, @revisorId, @estado, @observacion, @ahora, @revisada)
    ON CONFLICT(of_id) DO UPDATE SET
      autor_id = excluded.autor_id,
      revisor_id = excluded.revisor_id,
      estado = excluded.estado,
      observacion = excluded.observacion,
      updated_at = excluded.updated_at,
      revisada = MAX(of_overlay.revisada, excluded.revisada)
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
    for (const c of m.cambiosOF ?? [])
      upsertOF.run({
        ofId: c.ofId,
        autorId: c.autorId,
        revisorId: c.revisorId,
        estado: c.estado,
        observacion: c.observacion,
        ahora,
        revisada: c.estado === "en_revision" ? 1 : 0,
      });
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
