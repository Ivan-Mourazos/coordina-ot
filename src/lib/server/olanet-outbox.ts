import { bonosDe, claveBonoRps, partirOfId, type FilaBono } from "../bonos";
import { eventosFaseDe, eventosFinalizacion, type EventoFase } from "../fases";
import type { Intervalo } from "../fichaje";
import { getDb, maquinasDeTareas } from "./estado-db";
import { COD_RPS_POR_OPERARIO, MAQUINA_POR_OPERARIO } from "./operarios";

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
 *  entraron (los repetidos se ignoran por la clave). Quien necesite SABER si
 *  entró (cerrar una OF en RPS exige su tiempo antes) usa
 *  `encolarFichajeOLanzar`. */
export function encolarFichaje(operarioId: string, intervalos: readonly Intervalo[]): number {
  try {
    return encolarFichajeOLanzar(operarioId, intervalos);
  } catch (e) {
    console.error("[fichaje] no se pudo encolar el fichaje:", e);
    return 0;
  }
}

/** Lo mismo que `encolarFichaje`, pero si la cola falla LANZA en vez de
 *  tragárselo. Un 0 de `encolarFichaje` no distingue "no había nada nuevo" de
 *  "no ha entrado": para cerrar una OF en RPS esa diferencia es la de escribir
 *  el cierre con o sin su tiempo. */
export function encolarFichajeOLanzar(operarioId: string, intervalos: readonly Intervalo[]): number {
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

  // La máquina de cada TAREA manda sobre la de la persona: ver `bonosDe`.
  const bonos = bonosDe(
    nuevos,
    COD_RPS_POR_OPERARIO,
    MAQUINA_POR_OPERARIO,
    maquinasDeTareas([...new Set(nuevos.flatMap((iv) => iv.ofIds))]),
  );
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
}

/** Vuelve a encolar las líneas de tiempo y los movimientos de fase de los
 *  tramos YA CERRADOS de una OF, sin tocar la marca de agua.
 *
 *  Es la red de «Dar por terminada en RPS»: si en un intento anterior el tramo
 *  cortado no llegó a entrar en la cola, el reloj ya está parado y el corte
 *  del reintento no encuentra nada; sin esto, la cola se vería limpia y el 3
 *  saldría sin ese tiempo.
 *
 *  Es idempotente: la clave de cada evento sale solo del intervalo (OF, tarea,
 *  operario, día y segundo de inicio para las líneas; OF, tarea, operario,
 *  estado y hora para los movimientos), la columna es UNIQUE y lo enviado se
 *  queda en la tabla con su `enviado_at`. Lo que ya estaba, pendiente o
 *  enviado, se ignora; solo entra lo que falta.
 *
 *  Solo los eventos de ESA OF: un intervalo con varias OF reparte su tiempo, y
 *  lo de las otras lo encola su propio camino. LANZA si la cola falla. */
export function encolarTramosDeOF(ofId: string, intervalos: readonly Intervalo[]): number {
  const destino = partirOfId(ofId);
  if (!destino) return 0;
  const cerrados = intervalos.filter((iv) => iv.fin !== null && iv.ofIds.includes(ofId));
  if (cerrados.length === 0) return 0;
  const esDeLaOF = (x: { of: string; numope: string }) => x.of === destino.of && x.numope === destino.numope;
  const bonos = bonosDe(
    cerrados,
    COD_RPS_POR_OPERARIO,
    MAQUINA_POR_OPERARIO,
    maquinasDeTareas([...new Set(cerrados.flatMap((iv) => iv.ofIds))]),
  ).filter(esDeLaOF);
  const fases = eventosFaseDe(cerrados).filter(esDeLaOF);
  return encolar([
    ...bonos.map((f) => ({ tipo: "bono" as const, clave: claveBono(f), operarioId: f.operario, datos: f })),
    ...fases.map((e) => ({ tipo: "fase" as const, clave: claveFase(e), operarioId: e.operarioId, datos: e })),
  ]);
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

/** Cuánto de una operación NO ha llegado a OLANET: lo que sigue pendiente y lo
 *  que se DESCARTÓ sin escribirse.
 *
 *  Es la comprobación de «Dar por terminada en RPS», y va aparte de
 *  `leerPendientes` por dos motivos:
 *  · Filtra en SQL y sin límite. Con 500 eventos de otras OF por delante,
 *    `leerPendientes()` no llegaba a ver los de esta y el 3 salía sin su tiempo.
 *  · Cuenta los descartados. `descartar` los marca con `enviado_at` para que
 *    dejen de bloquear la cola, así que para `leerPendientes` ya "salieron";
 *    pero no están en OLANET, y reencolarlos no sirve (su clave ya existe). La
 *    diferencia con uno enviado de verdad es el `DESCARTADO:` del error.
 *    Los de ensayo no cuentan: son movimientos de fase que no se escriben a
 *    propósito, no tiempo que RPS haya rechazado.
 *
 *  Y lo descartado se cuenta POR SEPARADO según qué sea, porque no se
 *  arreglan igual:
 *  · `descartados` es TIEMPO que RPS rechazó (los bonos). Se puede volver a
 *    intentar: es lo que hace «Reintentar envío».
 *  · `fasesDescartadas` son MOVIMIENTOS de la operación (el 1 al empezar, el 2
 *    al parar) que la cola no pudo escribir —normalmente porque OLANET ya no
 *    tiene esa fase—. Reencolarlos no arregla nada: el drenado los vuelve a
 *    descartar por lo mismo. Contarlos como tiempo rechazado daba el aviso de
 *    otra cosa y ofrecía un botón que no llevaba a ningún sitio.
 *
 *  La operación se compara sin ceros a la izquierda, como `claveFase`: la
 *  gemela "02" de una "2" también se cierra, y su tiempo también cuenta. */
export function sinLlegarAOlanet(
  orden: string,
  numope: string,
): { pendientes: number; descartados: number; fasesDescartadas: number } {
  const fila = getDb()
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN enviado_at IS NULL THEN 1 ELSE 0 END), 0) AS pendientes,
         COALESCE(SUM(CASE WHEN enviado_at IS NOT NULL AND tipo = 'bono' THEN 1 ELSE 0 END), 0) AS descartados,
         COALESCE(SUM(CASE WHEN enviado_at IS NOT NULL AND tipo = 'fase' THEN 1 ELSE 0 END), 0) AS fasesDescartadas
       FROM olanet_pendiente
       WHERE json_extract(datos, '$.of') = ?
         AND ltrim(json_extract(datos, '$.numope'), '0') = ltrim(?, '0')
         AND (enviado_at IS NULL
              OR (error LIKE 'DESCARTADO:%' AND error NOT LIKE 'DESCARTADO: ensayo:%'))`,
    )
    .get(orden, numope) as { pendientes: number; descartados: number; fasesDescartadas: number };
  return {
    pendientes: fila.pendientes,
    descartados: fila.descartados,
    fasesDescartadas: fila.fasesDescartadas,
  };
}

/** Vuelve a poner en la cola lo DESCARTADO de una operación, reiniciando sus
 *  intentos: es «Reintentar envío» (spec 2026-09-15, «Confirmado con Iván»
 *  punto 5). Solo se toca lo que de verdad rechazó RPS (`enviado_at` puesto
 *  con `error LIKE 'DESCARTADO:%'`, salvo lo de ensayo, que no es un rechazo):
 *  ni lo pendiente ni lo ya enviado de verdad. `enviado_at = NULL` es
 *  literalmente "vuelve a la cola" (ver `leerPendientes`), y borrar el error
 *  no esconde nada — el intento anterior queda en el log del servidor, y aquí
 *  lo que importa es dejarlo limpio para los cinco intentos siguientes.
 *
 *  No escribe nada en OLANET por sí mismo: quien procesa la cola de verdad es
 *  `drenarCola`, con las mismas reglas de siempre (`modoFichaje`). Devuelve
 *  cuántos eventos volvieron. */
export function reencolarDescartados(orden: string, numope: string): number {
  const r = getDb()
    .prepare(
      `UPDATE olanet_pendiente
          SET enviado_at = NULL, error = NULL, intentos = 0
        WHERE json_extract(datos, '$.of') = ?
          AND ltrim(json_extract(datos, '$.numope'), '0') = ltrim(?, '0')
          AND enviado_at IS NOT NULL
          AND error LIKE 'DESCARTADO:%' AND error NOT LIKE 'DESCARTADO: ensayo:%'`,
    )
    .run(orden, numope);
  return r.changes;
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

/** Deja constancia del fallo sin marcar como enviado: se reintentará.
 *
 *  `contar: false` apunta el error SIN gastar un intento: es para cuando
 *  OLANET no responde, que no es culpa del evento (ver `esCaidaDeOlanet`). */
export function marcarError(id: number, mensaje: string, { contar = true } = {}): void {
  getDb()
    .prepare(
      `UPDATE olanet_pendiente SET error = ?, intentos = intentos + ${contar ? 1 : 0} WHERE id = ?`,
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
