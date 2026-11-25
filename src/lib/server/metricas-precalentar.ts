import { periodoAnioRps } from "../metricas";
import { hoyISO } from "../types";
import { activarCacheEnDisco } from "./cache-disco";
import { getPool } from "./db";
import { leerIncidenciasMetricas, leerPasesRps } from "./metricas-fuentes";
import { leerNcPeriodo } from "./nc-db";

// ─── Las fuentes de RPS de Métricas, al arrancar y cada hora ─────────────────
// Métricas se mira de vez en cuando y sus datos de RPS no son del minuto, así
// que nadie debería esperarlos (Iván, 25/11/2026). Al arrancar se piden en
// serie, con el periodo de las gráficas (`periodoAnioRps`), y luego cada hora
// por detrás:
//
//  · incidencias de OT y Diseño: se renuevan en cada vuelta;
//  · OF pasadas en RPS: meses que ya no cambian, solo al caducar (6 h);
//  · no conformidades: solo informativas, una vez al día (24 h).
//
// Lo que caduca entre vueltas se sigue sirviendo mientras se rehace, y tras un
// reinicio se sirve lo del disco (ver cache-disco.ts). Antes de esto, el
// primero que abría Métricas tras caducar las NC esperaba sus 8,7 s enteros.

const HORA_MS = 3_600_000;
let arranque: Promise<void> | undefined;

/** Lo más ocupadas que han estado las conexiones a RPS mientras se esperaba
 *  una consulta, para dejarlo escrito en el log. En el servidor estas dos
 *  tardaban al arrancar 20 s y 48 s, y solas 8 s y 11 s (16/11/2026): sin este
 *  dato no se sabe si es que RPS iba cargado o que no quedaban conexiones
 *  libres (son cinco, ver db.ts) y la consulta esperó su turno. */
function vigilarConexiones(pool: { borrowed?: number; pending?: number } | null): () => string {
  let ocupadas = -1;
  let enCola = 0;
  const mirar = () => {
    if (typeof pool?.borrowed !== "number") return;
    ocupadas = Math.max(ocupadas, pool.borrowed);
    enCola = Math.max(enCola, pool.pending ?? 0);
  };
  mirar();
  const cadaSegundo = setInterval(mirar, 1_000);
  cadaSegundo.unref?.();
  return () => {
    clearInterval(cadaSegundo);
    mirar();
    return ocupadas < 0 ? "" : ` (RPS mientras tanto: hasta ${ocupadas} conexiones ocupadas y ${enCola} consultas en cola)`;
  };
}

export async function precalentarMetricas(): Promise<void> {
  if (process.env.DATASOURCE !== "rps") return;
  arranque ??= iniciarRefresco();
  return arranque;
}

async function iniciarRefresco(): Promise<void> {
  activarCacheEnDisco();
  await refrescarMetricas();

  let enCurso = false;
  setInterval(async () => {
    if (enCurso) return;
    enCurso = true;
    try {
      await refrescarMetricas();
    } catch (e) {
      console.warn("[metricas] no se pudieron refrescar las fuentes:", (e as Error).message);
    } finally {
      enCurso = false;
    }
  }, HORA_MS).unref();
}

async function refrescarMetricas(): Promise<void> {
  // Solo para mirar cómo están las conexiones: si RPS no contesta, cada
  // fuente lo dirá por su cuenta al pedirse.
  const pool = await getPool().catch(() => null);
  const hoy = hoyISO();
  const anio = periodoAnioRps(hoy.slice(0, 4), hoy);
  const fuentes: Array<[string, () => Promise<unknown>]> = [
    // Las NC solo se consultan al caducar o al cambiar el tramo. Si hay
    // consulta, se espera a que termine antes de pasar a las demás fuentes.
    ["no conformidades", () => leerNcPeriodo(anio, { disco: true, esperarRps: true })],
    // Meses de antes de Coordina, que ya no cambian: solo al caducar (6 h).
    ["OF pasadas en RPS", () => leerPasesRps(anio, "ot", { esperarRps: true })],
    ["incidencias de OT", () => leerIncidenciasMetricas(anio, "ot", { forzarRps: true })],
    ["incidencias de Diseño", () => leerIncidenciasMetricas(anio, "diseno", { forzarRps: true })],
  ];
  // Una detrás de otra: el arranque ya tiene al tablero pidiendo a RPS, y las
  // conexiones son pocas (ver db.ts). Si una falla, la siguiente se intenta
  // igual. Métricas puede servir lo anterior mientras se vuelve a intentar.
  for (const [nombre, pedir] of fuentes) {
    const t0 = Date.now();
    const conexiones = vigilarConexiones(pool);
    try {
      await pedir();
      console.info(`[metricas] ${nombre} del año listas en ${Date.now() - t0} ms${conexiones()}`);
    } catch (e) {
      conexiones();
      console.warn(`[metricas] no se pudo actualizar ${nombre}:`, (e as Error).message);
    }
  }
}
