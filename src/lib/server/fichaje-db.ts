import type { Fichaje, Intervalo } from "../fichaje";
import type { Rol } from "../types";
import { getDb } from "./estado-db";

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

export function leerTodosIntervalos(): Intervalo[] {
  const filas = getDb().prepare(`${SELECT} ORDER BY inicio`).all() as Fila[];
  return filas.map(filaAIntervalo).filter((x): x is Intervalo => x !== null);
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
 *  se reescribe todo: más vale pagar el coste que dejar filas descolgadas. */
export function guardarFichaje(operarioId: string, f: Fichaje): void {
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
}
