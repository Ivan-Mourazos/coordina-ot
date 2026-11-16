import { appendFileSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { afterAll, expect, test } from "vitest";
import { getPool } from "../src/lib/server/db";
import { SECCIONES, type SeccionId } from "../src/lib/secciones";
import { asegurarIndice, construirIndice, precalentarHistorial } from "../src/lib/server/historial-indice";
import { guardarInstantanea, leerInstantanea, rutaInstantanea } from "../src/lib/server/historial-instantanea";
import { leerHistorialPagina } from "../src/lib/server/historial-db";
import { leerFamiliasMetricas, leerIncidenciasMetricas, leerPasesRps } from "../src/lib/server/metricas-fuentes";
import { leerNcPeriodo } from "../src/lib/server/nc-db";

// Mide lo que cuesta, recién arrancado el servidor, lo que el Historial y las
// Métricas le piden a RPS: la lista en memoria (paso a paso, ver el log de
// `construir`), la consulta de respaldo del Historial cuando la lista aún no
// está, y las fuentes de RPS de las Métricas.
//
// Son consultas pesadas contra la base de la fábrica: una pasada, no en bucle.
//
// Opt-in: VALIDAR_RPS_UI=1 MEDIR_SALIDA=medir.log node --env-file=.env.local
// node_modules/vitest/vitest.mjs run scripts/medir-arranque.test.ts

const ACTIVO = process.env.VALIDAR_RPS_UI === "1";

// Las cifras van también a un fichero (MEDIR_SALIDA): vitest mezcla lo que se
// escribe por consola con su propio informe y es fácil perderlas.
const SALIDA = process.env.MEDIR_SALIDA;
const consolaInfo = console.info.bind(console);
const anotar = (...partes: unknown[]) => {
  const linea = partes.map(String).join(" ");
  consolaInfo(linea);
  if (SALIDA) appendFileSync(SALIDA, `${linea}\n`);
};
// El desglose de la lista lo escribe `construir` por consola.
console.info = anotar;

afterAll(async () => {
  console.info = consolaInfo;
  if (ACTIVO) await (await getPool()).close();
});

async function medir<T>(nombre: string, tarea: () => Promise<T>): Promise<T | null> {
  const t = Date.now();
  try {
    const r = await tarea();
    const n = Array.isArray(r) ? ` (${r.length} filas)` : "";
    anotar(`[medir] ${nombre}: ${Date.now() - t} ms${n}`);
    return r;
  } catch (e) {
    anotar(`[medir] ${nombre}: FALLA a los ${Date.now() - t} ms: ${(e as Error).message}`);
    return null;
  }
}

// Las familias de las OF del año: la cuarta fuente del detalle de Métricas. Con
// las OF que OT cerró en RPS como lista de prueba (el registro de producción
// no está en este equipo), que es del mismo orden de tamaño.
test.skipIf(!ACTIVO)("lo que cuestan las familias de Métricas", async () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const pases = await leerPasesRps({ desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy }, "ot");
  const movs = pases.map((p) => ({ at: p.fecha, motivo: "entregar", ofId: `${p.orden}:10`, operarioId: null, observacion: null }));
  anotar(`[medir] familias: ${movs.length} OF de prueba`);
  const t = Date.now();
  const primera = await leerFamiliasMetricas(movs);
  anotar(`[medir] metricas · familias (1.ª vez): ${Date.now() - t} ms (${primera.size} OF)`);
  const t2 = Date.now();
  await leerFamiliasMetricas(movs);
  anotar(`[medir] metricas · familias (2.ª vez): ${Date.now() - t2} ms`);
}, 300_000);

// Un reinicio de verdad, con los datos de verdad: el servidor construye la
// lista y la guarda; al volver a arrancar la recupera del disco, y lo
// recuperado es IDÉNTICO a lo construido, dato a dato.
//
// Escribe en la carpeta real (`data/cache`) y la deja como estaba. Si ya hay
// una lista guardada no hace nada: sería la de un servidor de desarrollo.
test.skipIf(!ACTIVO)("un reinicio con la lista guardada", async () => {
  const ruta = rutaInstantanea();
  if (existsSync(ruta)) {
    anotar(`[medir] reinicio: ya hay una lista en ${ruta}; se deja y no se mide`);
    return;
  }
  const apagar = () => {
    clearInterval(globalThis.__coordinaHistorialPrecalentado);
    globalThis.__coordinaHistorialPrecalentado = undefined;
    globalThis.__coordinaHistorialIndice = undefined;
    globalThis.__coordinaHistorialEnVuelo = undefined;
  };
  const pagina0 = async () => (await leerHistorialPagina({ page: 0, seccion: "ot", pendientes: [] })).pedidos;
  try {
    precalentarHistorial();
    const construida = await asegurarIndice(600_000);
    expect(construida).not.toBeNull();
    if (!construida) return;
    for (let i = 0; i < 300 && !existsSync(ruta); i++) await new Promise((seguir) => setTimeout(seguir, 100));
    expect(existsSync(ruta)).toBe(true);
    const antes = await medir("reinicio · página 0 con la lista construida", pagina0);

    // Reinicio: la memoria se pierde, el disco no.
    apagar();
    const t = Date.now();
    precalentarHistorial();
    const recuperada = await asegurarIndice(60_000);
    anotar(`[medir] reinicio · lista disponible a los ${Date.now() - t} ms de arrancar`);
    expect(recuperada).not.toBeNull();
    if (!recuperada) return;
    expect(recuperada).not.toBe(construida);
    expect(recuperada.at).toBe(construida.at);
    const despues = await medir("reinicio · página 0 con la lista recuperada", pagina0);
    expect(despues).toEqual(antes);

    let distintos = 0;
    const comparar = (que: string, a: unknown, b: unknown) => {
      if (isDeepStrictEqual(a, b)) return;
      if (distintos++ < 5) anotar(`[medir] reinicio · DISTINTO ${que}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
    };
    for (const s of Object.keys(SECCIONES) as SeccionId[]) {
      expect(recuperada.base[s].length).toBe(construida.base[s].length);
      construida.base[s].forEach((b, i) => comparar(`${s} ${b.pedido}`, b, recuperada.base[s][i]));
    }
    expect(recuperada.info.size).toBe(construida.info.size);
    for (const [pedido, i] of construida.info) comparar(`textos ${pedido}`, i, recuperada.info.get(pedido));
    expect(recuperada.personas.size).toBe(construida.personas.size);
    for (const [pedido, quienes] of construida.personas) comparar(`personas ${pedido}`, quienes, recuperada.personas.get(pedido));
    anotar(`[medir] reinicio · datos distintos entre lo construido y lo recuperado: ${distintos}`);
    expect(distintos).toBe(0);
  } finally {
    apagar();
    rmSync(ruta, { force: true });
  }
}, 900_000);

test.skipIf(!ACTIVO)("lo que cuesta un arranque en frío", async () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const anio = { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy };

  // Métricas, cada fuente por separado y la primera vez (sin nada guardado).
  await medir("metricas · incidencias OT (año)", () => leerIncidenciasMetricas(anio, "ot"));
  await medir("metricas · incidencias Diseño (año)", () => leerIncidenciasMetricas(anio, "diseno"));
  await medir("metricas · OF pasadas en RPS (año)", () => leerPasesRps(anio, "ot"));
  await medir("metricas · no conformidades (año)", () => leerNcPeriodo(anio));
  await medir("metricas · incidencias OT (2.ª vez)", () => leerIncidenciasMetricas(anio, "ot"));

  // El Historial sin la lista en memoria: lo que espera quien lo abre justo
  // después de reiniciar. `construirIndice` no guarda la lista, así que
  // `leerHistorialPagina` va siempre por la consulta de respaldo.
  await medir("historial · página 0 sin lista (respaldo)", async () => (await leerHistorialPagina({ page: 0, seccion: "ot", pendientes: [] })).pedidos);

  // La lista entera; el desglose por consulta sale en el log de `construir`.
  const indice = await medir("historial · lista en memoria", () => construirIndice());
  if (!indice) return;
  anotar(`[medir] memoria con la lista hecha: ${Math.round(process.memoryUsage().rss / 1_048_576)} MB`);

  // Lo que cuesta guardarla en disco y recuperarla al arrancar.
  const carpeta = mkdtempSync(path.join(os.tmpdir(), "coordina-medir-"));
  const ruta = path.join(carpeta, "historial-lista.ndjson.gz");
  try {
    await medir("historial · guardar la lista en disco", () => guardarInstantanea(indice, ruta));
    anotar(`[medir] fichero de la lista: ${(statSync(ruta).size / 1_048_576).toFixed(1)} MB`);
    const recuperada = await medir("historial · recuperar la lista del disco", () =>
      leerInstantanea(ruta, { secciones: Object.keys(SECCIONES) as SeccionId[], maxEdadMs: 3_600_000 }));
    expect(recuperada?.info.size).toBe(indice.info.size);
    for (const s of Object.keys(SECCIONES) as SeccionId[]) expect(recuperada?.base[s].length).toBe(indice.base[s].length);
    expect(recuperada?.personas.size).toBe(indice.personas.size);
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
}, 900_000);
