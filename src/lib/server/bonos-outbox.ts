import { bonosDe, type FilaBono } from "../bonos";
import type { Intervalo } from "../fichaje";
import { getDb } from "./estado-db";
import { COD_RPS_POR_OPERARIO } from "./operarios";

// ─── Cola de salida del fichaje hacia OLANET ─────────────────────────────────
// Patrón outbox: la verdad del fichaje es la BD de CoordinaOT, y los bonos se
// empujan a OLANET aparte. Así una caída de la VPN o del servidor de OLANET no
// pierde horas de trabajo — se reintenta cuando vuelva. Es también la razón de
// que no haga falta el "fichaje de emergencia" contra un segundo servidor que
// propuso IT: dos sitios donde escribir son dos verdades que luego hay que
// conciliar a mano.
//
// Mientras MODO sea "sombra" NADA sale de aquí: las filas se acumulan para
// poder compararlas con lo que graba el mini-olanet antes de escribir de
// verdad en OFs reales.

export type ModoFichaje = "sombra" | "activo";

/** Por defecto sombra: para escribir en OLANET hay que pedirlo a propósito. */
export function modoFichaje(): ModoFichaje {
  return process.env.FICHAJE_OLANET === "activo" ? "activo" : "sombra";
}

export interface BonoEnCola {
  id: number;
  clave: string;
  operarioId: string;
  fila: FilaBono;
  creadoAt: string;
  enviadoAt: string | null;
  error: string | null;
}

interface FilaCola {
  id: number;
  clave: string;
  operario_id: string;
  fila: string;
  creado_at: string;
  enviado_at: string | null;
  error: string | null;
}

/** Clave natural de un sub-tramo. Dos derivaciones del mismo fichaje dan la
 *  misma clave, así que reencolar no duplica. */
export function claveDe(f: FilaBono): string {
  return [f.of, f.numope, f.operario, f.ini, f.horaini].join("|");
}

function aBono(fila: FilaCola): BonoEnCola | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fila.fila);
  } catch {
    return null; // fila corrupta: se ignora, nunca se propaga a medias
  }
  return {
    id: fila.id,
    clave: fila.clave,
    operarioId: fila.operario_id,
    fila: parsed as FilaBono,
    creadoAt: fila.creado_at,
    enviadoAt: fila.enviado_at,
    error: fila.error,
  };
}

/** Deriva los bonos de unos intervalos y los deja en la cola.
 *
 *  Nunca lanza: se llama justo después de guardar el fichaje, y que la cola
 *  falle no puede impedir que alguien fiche. Devuelve cuántas filas nuevas
 *  entraron (las repetidas se ignoran por la clave). */
export function encolarBonos(intervalos: readonly Intervalo[]): number {
  let filas: FilaBono[];
  try {
    filas = bonosDe(intervalos, COD_RPS_POR_OPERARIO);
  } catch (e) {
    console.error("[fichaje] no se pudieron derivar los bonos:", e);
    return 0;
  }
  if (filas.length === 0) return 0;

  const db = getDb();
  const ahora = new Date().toISOString();
  const ins = db.prepare(
    `INSERT OR IGNORE INTO bono_pendiente (clave, operario_id, fila, creado_at)
     VALUES (?, ?, ?, ?)`,
  );
  try {
    return db.transaction(() => {
      let nuevas = 0;
      for (const f of filas) {
        const r = ins.run(claveDe(f), f.operario, JSON.stringify(f), ahora);
        nuevas += r.changes;
      }
      return nuevas;
    })();
  } catch (e) {
    console.error("[fichaje] no se pudieron encolar los bonos:", e);
    return 0;
  }
}

const SELECT = `SELECT id, clave, operario_id, fila, creado_at, enviado_at, error
                FROM bono_pendiente`;

/** Bonos aún no enviados a OLANET, en orden de llegada. */
export function leerPendientes(limite = 500): BonoEnCola[] {
  const filas = getDb()
    .prepare(`${SELECT} WHERE enviado_at IS NULL ORDER BY id LIMIT ?`)
    .all(limite) as FilaCola[];
  return filas.map(aBono).filter((x): x is BonoEnCola => x !== null);
}

/** Todos los bonos, enviados o no. Para revisar el modo sombra. */
export function leerCola(limite = 500): BonoEnCola[] {
  const filas = getDb()
    .prepare(`${SELECT} ORDER BY id DESC LIMIT ?`)
    .all(limite) as FilaCola[];
  return filas.map(aBono).filter((x): x is BonoEnCola => x !== null);
}

export function marcarEnviados(ids: readonly number[]): void {
  if (ids.length === 0) return;
  const db = getDb();
  const upd = db.prepare(
    "UPDATE bono_pendiente SET enviado_at = ?, error = NULL WHERE id = ?",
  );
  const ahora = new Date().toISOString();
  db.transaction(() => {
    for (const id of ids) upd.run(ahora, id);
  })();
}

/** Deja constancia del fallo sin marcar como enviado: se reintentará. */
export function marcarError(id: number, mensaje: string): void {
  getDb()
    .prepare("UPDATE bono_pendiente SET error = ? WHERE id = ?")
    .run(mensaje.slice(0, 1000), id);
}
