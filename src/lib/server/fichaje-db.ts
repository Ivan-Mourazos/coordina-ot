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

export function guardarFichaje(operarioId: string, f: Fichaje): void {
  const db = getDb();
  const ahora = new Date().toISOString();
  const del = db.prepare("DELETE FROM fichaje_intervalo WHERE operario_id = ?");
  const ins = db.prepare(
    "INSERT INTO fichaje_intervalo (operario_id, of_ids, rol, inicio, fin, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  db.transaction(() => {
    del.run(operarioId);
    for (const iv of f.intervalos) {
      // Se fuerza el operarioId de la fila: un guardado solo toca SUS filas.
      ins.run(operarioId, JSON.stringify(iv.ofIds), iv.rol, iv.inicio, iv.fin, ahora);
    }
  })();
}
