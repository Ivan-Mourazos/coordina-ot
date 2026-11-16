import { periodoAnioRps } from "../metricas";
import { hoyISO } from "../types";
import { activarCacheEnDisco } from "./cache-disco";
import { getPool } from "./db";
import { leerPasesRps } from "./metricas-fuentes";
import { leerNcPeriodo } from "./nc-db";

// ─── Las fuentes de RPS de Métricas, pedidas al arrancar ─────────────────────
// De las cuatro consultas del detalle de Métricas, dos se guardan en memoria
// porque son las lentas: las no conformidades del año (8,7 s) y las OF que OT
// cerró en RPS antes de Coordina (4 s). Medido el 16/11/2026 con
// scripts/medir-arranque.test.ts; las otras dos, incidencias y familias, son
// 2,7 s y 0,7 s.
//
// Lo guardado se pierde en cada reinicio, y cada actualización de la web es un
// reinicio: el primero que abría Métricas después volvía a esperarlas enteras,
// y compitiendo con todo lo demás que el arranque le pide a RPS.
//
// Aquí se piden nada más arrancar, con el periodo que pedirán las gráficas
// (`periodoAnioRps`). Si alguien abre Métricas mientras tanto no se duplican:
// lo que se guarda es la consulta en curso, y se engancha a ella. Y no espera:
// pedirlas al arrancar no bastó (seguían tardando 20 s y 48 s el 16/11/2026),
// así que mientras llegan se sirve lo guardado en disco (ver cache-disco.ts).

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
  // Desde aquí lo de Métricas se guarda en disco y, nada más arrancar, se
  // sirve de allí mientras RPS contesta (ver cache-disco.ts).
  activarCacheEnDisco();
  // Solo para mirar cómo están las conexiones: si RPS no contesta, cada
  // fuente lo dirá por su cuenta al pedirse.
  const pool = await getPool().catch(() => null);
  const hoy = hoyISO();
  const anio = periodoAnioRps(hoy.slice(0, 4), hoy);
  const fuentes: Array<[string, () => Promise<unknown>]> = [
    // `esperarRps`: lo cronometrado es RPS y no el disco, y la segunda no
    // empieza hasta que RPS acaba con la primera.
    ["no conformidades", () => leerNcPeriodo(anio, { disco: true, esperarRps: true })],
    ["OF pasadas en RPS", () => leerPasesRps(anio, "ot", { esperarRps: true })],
  ];
  // Una detrás de otra: el arranque ya tiene al tablero pidiendo a RPS, y las
  // conexiones son pocas (ver db.ts). Si una falla, la siguiente se intenta
  // igual, y quien abra Métricas la volverá a pedir como hasta ahora.
  for (const [nombre, pedir] of fuentes) {
    const t0 = Date.now();
    const conexiones = vigilarConexiones(pool);
    try {
      await pedir();
      console.info(`[metricas] ${nombre} del año listas en ${Date.now() - t0} ms${conexiones()}`);
    } catch (e) {
      conexiones();
      console.warn(`[metricas] no se pudieron precalentar las ${nombre}:`, (e as Error).message);
    }
  }
}
