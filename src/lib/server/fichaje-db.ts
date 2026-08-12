import type { Fichaje, Intervalo } from "../fichaje";
import { fichar } from "../fichaje";
import type { Rol } from "../types";
import { getDb } from "./estado-db";
import { encolarFichaje } from "./olanet-outbox";

// ─── Persistencia del fichaje (SQLite propio) ────────────────────────────────
// Los intervalos de tiempo por operario. La HORA la pone siempre el server al
// aplicar el motor; aquí solo se guardan/leen. Reemplazo completo por operario:
// no hay fichaje simultáneo desde dos equipos, así que last-write-wins basta.

interface Fila {
  operario_id: string;
  of_ids: string;
  rol: string;
  inicio: string;
  fin: string | null;
}

function filaAIntervalo(fila: Fila): Intervalo | null {
  let ofIds: unknown;
  try {
    ofIds = JSON.parse(fila.of_ids);
  } catch {
    return null; // fila corrupta: se ignora, nunca se propaga a medias
  }
  if (!Array.isArray(ofIds) || !ofIds.every((x) => typeof x === "string")) return null;
  if (fila.rol !== "plantear" && fila.rol !== "revisar") return null;
  return {
    inicio: fila.inicio,
    fin: fila.fin,
    ofIds: ofIds as string[],
    rol: fila.rol as Rol,
    operarioId: fila.operario_id,
  };
}

const SELECT = "SELECT operario_id, of_ids, rol, inicio, fin FROM fichaje_intervalo";

export function leerFichaje(operarioId: string): Fichaje {
  const filas = getDb()
    .prepare(`${SELECT} WHERE operario_id = ? ORDER BY inicio`)
    .all(operarioId) as Fila[];
  return {
    intervalos: filas.map(filaAIntervalo).filter((x): x is Intervalo => x !== null),
  };
}

/** Los intervalos que TODAVÍA cuenta CoordinaOT.
 *
 *  Deja fuera los ya traspasados a RPS: esos minutos los cuenta RPS, y sumarlos
 *  también aquí sería contarlos dos veces (ver traspaso-fichaje.ts). Hoy no hay
 *  ninguno —nada sale de la cola mientras el modo no sea `activo`—, así que el
 *  filtro no quita nada hasta que se dé ese paso.
 *
 *  `leerFichaje` NO filtra, a propósito: el motor de fichaje necesita la lista
 *  completa del operario para añadir y cerrar tramos, y la marca de la cola
 *  (olanet_watermark) cuenta posiciones sobre esa lista. */
export function leerTodosIntervalos(): Intervalo[] {
  const filas = getDb()
    .prepare(`${SELECT} WHERE traspasado_at IS NULL ORDER BY inicio`)
    .all() as Fila[];
  return filas.map(filaAIntervalo).filter((x): x is Intervalo => x !== null);
}

/** Sella los tramos que OLANET ya traspasó a RPS. La clave es (operario,
 *  inicio), la misma con la que se guardan. Devuelve cuántos se sellaron. */
export function marcarTraspasados(
  tramos: readonly { operarioId: string; inicio: string }[],
  cuando = new Date().toISOString(),
): number {
  if (tramos.length === 0) return 0;
  const db = getDb();
  const upd = db.prepare(
    `UPDATE fichaje_intervalo SET traspasado_at = ?
      WHERE operario_id = ? AND inicio = ? AND traspasado_at IS NULL`,
  );
  return db.transaction(() => {
    let n = 0;
    for (const t of tramos) n += upd.run(cuando, t.operarioId, t.inicio).changes;
    return n;
  })();
}

/** Deja constancia de que la pestaña de este operario sigue viva. La llama el
 *  endpoint /api/fichaje/latido cada 60 s mientras haya un fichaje corriendo,
 *  y guardarFichaje() en cada guardado (abrir/cambiar/pausar cuenta igual de
 *  "sigo viva" que el aviso periódico): así un intervalo recién abierto
 *  nunca se queda sin latido esperando al primer tick del cliente. */
export function registrarLatido(operarioId: string, ultimo: string): void {
  getDb()
    .prepare(
      `INSERT INTO fichaje_latido (operario_id, ultimo) VALUES (?, ?)
       ON CONFLICT(operario_id) DO UPDATE SET ultimo = excluded.ultimo`,
    )
    .run(operarioId, ultimo);
}

/** Último latido conocido de un operario, o `null` si nunca se registró
 *  ninguno (ver el caso "sin latido" en cerrarPorInactividad, lib/fichaje.ts). */
export function leerUltimoLatido(operarioId: string): string | null {
  const fila = getDb()
    .prepare("SELECT ultimo FROM fichaje_latido WHERE operario_id = ?")
    .get(operarioId) as { ultimo: string } | undefined;
  return fila?.ultimo ?? null;
}

export interface AvisoCierre {
  ofIds: string[];
  fin: string; // ISO, hora real del último latido — no la del chequeo
}

/** Dejar constancia de que cerrarFichajesSinLatido cerró un intervalo de este
 *  operario, para que se entere al volver: si no, mañana ve menos tiempo del
 *  esperado y no sabe por qué. Un aviso pendiente por operario basta (si
 *  hubiera dos seguidos sin que nadie cargue la app entre medias, el segundo
 *  sustituye al primero: es información de servicio, no un historial). */
export function registrarAvisoCierre(operarioId: string, ofIds: readonly string[], fin: string): void {
  getDb()
    .prepare(
      `INSERT INTO fichaje_aviso_cierre (operario_id, of_ids, fin, creado_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(operario_id) DO UPDATE SET
         of_ids = excluded.of_ids, fin = excluded.fin, creado_at = excluded.creado_at`,
    )
    .run(operarioId, JSON.stringify(ofIds), fin, new Date().toISOString());
}

/** Lee el aviso pendiente de este operario SIN borrarlo.
 *
 *  Antes se borraba al leerlo, y eso lo hacía frágil: si la respuesta se
 *  perdía por el camino, o si otra pestaña la pedía primero, el aviso
 *  desaparecía y el técnico nunca se enteraba de que su fichaje se había
 *  cerrado solo — que es justo lo que este aviso existe para evitar. Ahora
 *  espera a que el cliente confirme que lo ha enseñado (ver
 *  `marcarAvisoCierreVisto`), así que sobrevive a recargas y a fallos de red. */
export function leerAvisoCierre(operarioId: string): AvisoCierre | null {
  const fila = getDb()
    .prepare("SELECT of_ids, fin FROM fichaje_aviso_cierre WHERE operario_id = ?")
    .get(operarioId) as { of_ids: string; fin: string } | undefined;
  if (!fila) return null;
  let ofIds: unknown;
  try {
    ofIds = JSON.parse(fila.of_ids);
  } catch {
    return null; // fila corrupta: se descarta, nunca se propaga a medias
  }
  if (!Array.isArray(ofIds) || !ofIds.every((x) => typeof x === "string")) return null;
  return { ofIds: ofIds as string[], fin: fila.fin };
}

/** Borra el aviso: lo llama el cliente cuando el técnico ya lo ha visto. */
export function marcarAvisoCierreVisto(operarioId: string): void {
  getDb().prepare("DELETE FROM fichaje_aviso_cierre WHERE operario_id = ?").run(operarioId);
}

/** Cierra el fichaje que CUALQUIER operario tenga abierto sobre esta OF y
 *  devuelve a quiénes afectó.
 *
 *  Existe porque traspasar una OF es soltarla: si el intervalo sigue abierto,
 *  al anterior le sigue corriendo el tiempo de algo que ya no es suyo. Y a
 *  diferencia del resto del fichaje, esto NO lo puede hacer el navegador de
 *  quien traspasa: el afectado puede estar en otro equipo, o con la app
 *  cerrada. Lo hace el servidor, con su reloj, que es la hora oficial.
 *
 *  Si el intervalo llevaba más OFs, se cierra y se abre otro con las que
 *  quedan: borrarlo perdería el tiempo de las que siguen siendo suyas. */
export function cortarFichajeDeOF(ofId: string, ahora: string): string[] {
  const abiertos = getDb()
    .prepare(`${SELECT} WHERE fin IS NULL`)
    .all() as Fila[];
  const afectados: string[] = [];
  for (const fila of abiertos) {
    const iv = filaAIntervalo(fila);
    if (!iv || !iv.ofIds.includes(ofId)) continue;
    const resto = iv.ofIds.filter((id) => id !== ofId);
    const actual = leerFichaje(iv.operarioId);
    const nuevo = fichar(actual, resto, iv.rol, iv.operarioId, ahora);
    // Quien traspasa la OF no es el operario afectado, así que este guardado
    // no prueba que su pestaña siga viva (ver la excepción documentada en
    // guardarFichaje).
    guardarFichaje(iv.operarioId, nuevo, { latido: false });
    // Mismo camino que cualquier otro cierre (ver POST /api/fichaje y
    // cerrarFichajesSinLatido): sin esto, si esta OF era la única abierta de
    // este operario, el tramo queda cerrado aquí pero nunca sube a OLANET —
    // y como cerrarFichajesSinLatido solo vigila intervalos ABIERTOS, si el
    // operario no vuelve a fichar ese tiempo no se encola jamás.
    encolarFichaje(iv.operarioId, nuevo.intervalos);
    afectados.push(iv.operarioId);
  }
  return afectados;
}

/** Guarda el fichaje de un operario.
 *
 *  Solo el ÚLTIMO intervalo puede estar abierto, y `fichar`/`pausar` nunca
 *  tocan los anteriores: la lista es de solo-añadir salvo por su cola. Así que
 *  se escribe únicamente lo que puede haber cambiado, en vez de reescribir el
 *  histórico entero en cada pulsación (con meses de fichajes eso eran miles de
 *  filas por POST). La clave natural (operario, inicio) resuelve el upsert.
 *
 *  Si en la BD hay más intervalos de los que llegan, la premisa no se cumple y
 *  se reescribe todo: más vale pagar el coste que dejar filas descolgadas.
 *
 *  `opciones.latido` (por defecto true) controla si este guardado cuenta como
 *  prueba de vida del operario — ver el comentario junto a registrarLatido()
 *  más abajo para el porqué de la excepción. */
export function guardarFichaje(
  operarioId: string,
  f: Fichaje,
  opciones: { latido?: boolean } = {},
): void {
  const db = getDb();
  const ahora = new Date().toISOString();
  const contar = db.prepare(
    "SELECT COUNT(*) AS n FROM fichaje_intervalo WHERE operario_id = ?",
  );
  const del = db.prepare("DELETE FROM fichaje_intervalo WHERE operario_id = ?");
  const ins = db.prepare(
    `INSERT INTO fichaje_intervalo (operario_id, of_ids, rol, inicio, fin, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(operario_id, inicio) DO UPDATE SET
       of_ids = excluded.of_ids,
       rol = excluded.rol,
       fin = excluded.fin,
       updated_at = excluded.updated_at`,
  );
  db.transaction(() => {
    const guardados = (contar.get(operarioId) as { n: number }).n;
    // El último guardado pudo cerrarse desde entonces, así que se reescribe.
    const desde = guardados <= f.intervalos.length ? Math.max(0, guardados - 1) : 0;
    if (desde === 0) del.run(operarioId);
    for (const iv of f.intervalos.slice(desde)) {
      // Se fuerza el operarioId de la fila: un guardado solo toca SUS filas.
      ins.run(operarioId, JSON.stringify(iv.ofIds), iv.rol, iv.inicio, iv.fin, ahora);
    }
  })();
  // Cualquier guardado (abrir, cambiar de OF, pausar) prueba que la pestaña
  // está viva: cuenta como latido igual que el aviso periódico de 60 s, así
  // un intervalo recién abierto nunca queda sin latido esperando al primer
  // tick del cliente.
  //
  // EXCEPCIÓN: cortarFichajeDeOF pasa `latido: false`. Ahí quien dispara el
  // guardado no es el operario de la fila, sino OTRA persona que traspasa la
  // OF; el afectado puede llevar horas con la pestaña cerrada. Registrarle un
  // latido aquí le daría una prueba de vida que no ha dado, y retrasaría
  // hasta 5 min (TOLERANCIA_LATIDO_MS) que cerrarFichajesSinLatido cierre una
  // sesión ya muerta — inflando el tiempo de las OFs que le quedan.
  if (opciones.latido !== false) registrarLatido(operarioId, ahora);
}
