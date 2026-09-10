import { getPool } from "./db";
import { OPERARIOS } from "../mock";
import { operarioDeEmpleado } from "./operarios";
import { nombreHistorial } from "../nombre-historial";

let cache: { at: number; nombres: Map<string, string> } | undefined;
let carga: Promise<Map<string, string>> | undefined;

/** Catálogo pequeño, compartido por cabecera, roles locales y tiempos de RPS. */
export async function nombresHistorial(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.nombres;
  carga ??= (async () => {
    const nombres = new Map(OPERARIOS.map((o) => [o.id, o.nombre]));
    const pool = await getPool();
    const r = await pool.request().query<{ codigo: string; nombre: string }>(`
      SELECT CodEmployee AS codigo, Description AS nombre FROM dbo.GENEmployee WHERE CodCompany='001'
    `);
    for (const fila of r.recordset) {
      const codigo = fila.codigo?.trim();
      if (!codigo || !fila.nombre?.trim()) continue;
      const nombre = nombreHistorial(fila.nombre);
      nombres.set(codigo, nombre);
      const operario = operarioDeEmpleado(codigo);
      if (operario) nombres.set(operario, nombre);
    }
    cache = { at: Date.now(), nombres };
    return nombres;
  })().finally(() => { carga = undefined; });
  return carga;
}
