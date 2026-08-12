import { bonosDe, claveBonoRps, type FilaBono } from "../bonos";
import { eventosFaseDe, eventosFinalizacion, type EventoFase } from "../fases";
import type { Intervalo } from "../fichaje";
import { getDb } from "./estado-db";
import { COD_RPS_POR_OPERARIO } from "./operarios";

// ─── Cola de salida hacia OLANET ─────────────────────────────────────────────
// Patrón outbox: la verdad del fichaje es la BD de CoordinaOT, y lo que va a
// OLANET se empuja aparte. Así una caída de la VPN o del servidor no pierde
// horas de trabajo — se reintenta cuando vuelva. Es también lo que hace
// innecesario el "fichaje de emergencia" contra un segundo servidor que
// propuso IT: dos sitios donde escribir son dos verdades que luego hay que
// conciliar a mano.
//
// Mientras el modo sea "sombra" NADA sale de aquí: los eventos se acumulan
// para poder compararlos con lo que graba el mini-olanet antes de escribir de
// verdad en OFs reales.

/** · sombra → no sale nada; los eventos se acumulan para compararlos.
 *  · ensayo → se escribe en las tablas REALES, pero los bonos van con
 *    `traspasado = 2`, que OLANET no procesa: el tiempo no llega a RPS. Es la
 *    forma de probar contra producción que indicó IT, mejor que una tabla
 *    aparte porque ejercita el camino de verdad.
 *  · activo → se escribe y el tiempo sube a RPS. */
export type ModoFichaje = "sombra" | "ensayo" | "activo";

/** Por defecto sombra: para escribir en OLANET hay que pedirlo a propósito. */
export function modoFichaje(): ModoFichaje {
  const v = process.env.FICHAJE_OLANET;
  return v === "activo" || v === "ensayo" ? v : "sombra";
}

interface Comun {
  id: number;
  operarioId: string;
  enviadoAt: string | null;
  error: string | null;
  intentos: number;
}

export type Pendiente =
  | (Comun & { tipo: "bono"; datos: FilaBono })
  | (Comun & { tipo: "fase"; datos: EventoFase });

interface FilaCola {
  id: number;
  tipo: string;
  operario_id: string;
  datos: string;
  enviado_at: string | null;
  error: string | null;
  intentos: number;
}

function claveBono(f: FilaBono): string {
  // Mismas columnas que identifican el bono en OLANET (ver claveBonoRps), con
  // el tipo delante porque esta clave convive con las de fase en la cola.
  return `bono|${claveBonoRps(f)}`;
}

/** La hora entra en la clave: una misma fase se inicia e interrumpe muchas
 *  veces al día, y cada movimiento es un evento distinto. */
function claveFase(e: EventoFase): string {
  return ["fase", e.of, e.numope, e.operarioId, e.estado, e.cuando].join("|");
}

function aPendiente(fila: FilaCola): Pendiente | null {
  if (fila.tipo !== "bono" && fila.tipo !== "fase") return null;
  let datos: unknown;
  try {
    datos = JSON.parse(fila.datos);
  } catch {
    return null; // fila corrupta: se ignora, nunca se propaga a medias
  }
  return {
    id: fila.id,
    tipo: fila.tipo,
    operarioId: fila.operario_id,
    datos,
    enviadoAt: fila.enviado_at,
    error: fila.error,
    intentos: fila.intentos,
  } as Pendiente;
}

function encolar(
  entradas: readonly { tipo: "bono" | "fase"; clave: string; operarioId: string; datos: unknown }[],
): number {
  if (entradas.length === 0) return 0;
  const db = getDb();
  const ahora = new Date().toISOString();
  const ins = db.prepare(
    `INSERT OR IGNORE INTO olanet_pendiente (tipo, clave, operario_id, datos, creado_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  return db.transaction(() => {
    let nuevas = 0;
    for (const e of entradas) {
      nuevas += ins.run(e.tipo, e.clave, e.operarioId, JSON.stringify(e.datos), ahora).changes;
    }
    return nuevas;
  })();
}

/** Deriva de unos intervalos las líneas de tiempo y los movimientos de fase, y
 *  los deja en la cola en ese orden: el tiempo tiene que estar puesto antes de
 *  que la fase cambie de estado.
 *
 *  Solo procesa lo que puede haber cambiado. `fichar`/`pausar` nunca tocan un
 *  intervalo que no sea el último, así que todo lo anterior al primero abierto
 *  ya está en la cola y no hace falta volver a derivarlo; sin esto, cada
 *  pulsación reprocesaba meses de fichajes. La marca avanza en la MISMA
 *  transacción que el encolado: si falla, no se da nada por procesado.
 *
 *  Nunca lanza: se llama justo después de guardar el fichaje, y que la cola
 *  falle no puede impedir que alguien fiche. Devuelve cuántos eventos nuevos
 *  entraron (los repetidos se ignoran por la clave). */
export function encolarFichaje(operarioId: string, intervalos: readonly Intervalo[]): number {
  try {
    const db = getDb();
    const marca = db
      .prepare("SELECT procesados FROM olanet_watermark WHERE operario_id = ?")
      .get(operarioId) as { procesados: number } | undefined;

    // Si llegan menos intervalos de los dados por procesados, la premisa no se
    // cumple: se rederiva todo. Solo cuesta trabajo, nunca duplica (clave UNIQUE).
    const previos = marca?.procesados ?? 0;
    const desde = previos <= intervalos.length ? previos : 0;
    const nuevos = intervalos.slice(desde);

    // Un intervalo abierto aún puede cambiar (le falta su `fin`): se queda
    // fuera de la marca para reprocesarlo cuando se cierre.
    const abierto = intervalos.findIndex((iv) => iv.fin === null);
    const procesados = abierto === -1 ? intervalos.length : abierto;

    const bonos = bonosDe(nuevos, COD_RPS_POR_OPERARIO);
    const fases = eventosFaseDe(nuevos);
    const entradas = [
      ...bonos.map((f) => ({ tipo: "bono" as const, clave: claveBono(f), operarioId: f.operario, datos: f })),
      ...fases.map((e) => ({ tipo: "fase" as const, clave: claveFase(e), operarioId: e.operarioId, datos: e })),
    ];

    return db.transaction(() => {
      const n = encolar(entradas);
      db.prepare(
        `INSERT INTO olanet_watermark (operario_id, procesados) VALUES (?, ?)
         ON CONFLICT(operario_id) DO UPDATE SET procesados = excluded.procesados`,
      ).run(operarioId, procesados);
      return n;
    })();
  } catch (e) {
    console.error("[fichaje] no se pudo encolar el fichaje:", e);
    return 0;
  }
}

/** Encola la finalización (IdEstadoOF = 3) de las OFs de un pedido que se pasa
 *  a Producción. Es el único sitio que genera el 3: el fichaje por sí solo
 *  nunca da una fase por terminada. */
export function encolarFinalizacion(
  ofIds: readonly string[],
  operarioId: string,
  cuando = new Date().toISOString(),
): number {
  try {
    const eventos = eventosFinalizacion(ofIds, operarioId, cuando);
    return encolar(
      eventos.map((e) => ({ tipo: "fase" as const, clave: claveFase(e), operarioId, datos: e })),
    );
  } catch (e) {
    console.error("[fichaje] no se pudo encolar la finalización:", e);
    return 0;
  }
}

const SELECT = `SELECT id, tipo, operario_id, datos, enviado_at, error, intentos
                FROM olanet_pendiente`;

/** Eventos aún no enviados, en orden de llegada. El orden es el contrato: no
 *  reordenar ni paralelizar el envío. */
export function leerPendientes(limite = 500): Pendiente[] {
  const filas = getDb()
    .prepare(`${SELECT} WHERE enviado_at IS NULL ORDER BY id LIMIT ?`)
    .all(limite) as FilaCola[];
  return filas.map(aPendiente).filter((x): x is Pendiente => x !== null);
}

/** Todo lo encolado, enviado o no. Para revisar el modo sombra. */
export function leerCola(limite = 500): Pendiente[] {
  const filas = getDb()
    .prepare(`${SELECT} ORDER BY id DESC LIMIT ?`)
    .all(limite) as FilaCola[];
  return filas.map(aPendiente).filter((x): x is Pendiente => x !== null);
}

export function marcarEnviados(ids: readonly number[]): void {
  if (ids.length === 0) return;
  const db = getDb();
  const upd = db.prepare("UPDATE olanet_pendiente SET enviado_at = ?, error = NULL WHERE id = ?");
  const ahora = new Date().toISOString();
  db.transaction(() => {
    for (const id of ids) upd.run(ahora, id);
  })();
}

/** Deja constancia del fallo sin marcar como enviado: se reintentará. */
export function marcarError(id: number, mensaje: string): void {
  getDb()
    .prepare(
      "UPDATE olanet_pendiente SET error = ?, intentos = intentos + 1 WHERE id = ?",
    )
    .run(mensaje.slice(0, 1000), id);
}

/** Saca un evento de la cola SIN haberlo escrito en OLANET, conservando el
 *  motivo. Es para lo que no se va a arreglar solo (una fase que OLANET no
 *  tiene, un operario sin código): el orden de la cola es un contrato, así que
 *  un evento imposible no puede quedarse bloqueando a los que van detrás. El
 *  error queda visible en /api/fichaje/cola. */
export function descartar(id: number, motivo: string): void {
  getDb()
    .prepare(
      "UPDATE olanet_pendiente SET enviado_at = ?, error = ? WHERE id = ?",
    )
    .run(new Date().toISOString(), `DESCARTADO: ${motivo}`.slice(0, 1000), id);
}
