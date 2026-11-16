import { periodoAnioRps } from "../metricas";
import { hoyISO } from "../types";
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
// lo que se guarda es la consulta en curso, y se engancha a ella.

export async function precalentarMetricas(): Promise<void> {
  if (process.env.DATASOURCE !== "rps") return;
  const hoy = hoyISO();
  const anio = periodoAnioRps(hoy.slice(0, 4), hoy);
  const fuentes: Array<[string, () => Promise<unknown>]> = [
    ["no conformidades", () => leerNcPeriodo(anio)],
    ["OF pasadas en RPS", () => leerPasesRps(anio, "ot")],
  ];
  // Una detrás de otra: el arranque ya tiene al tablero pidiendo a RPS, y las
  // conexiones son pocas (ver db.ts). Si una falla, la siguiente se intenta
  // igual, y quien abra Métricas la volverá a pedir como hasta ahora.
  for (const [nombre, pedir] of fuentes) {
    const t0 = Date.now();
    try {
      await pedir();
      console.info(`[metricas] ${nombre} del año listas en ${Date.now() - t0} ms`);
    } catch (e) {
      console.warn(`[metricas] no se pudieron precalentar las ${nombre}:`, (e as Error).message);
    }
  }
}
