import sql from "mssql";
import { getPoolOlanet } from "./db";

// ─── Quién tiene cada tarea, según OLANET ────────────────────────────────────
// RPS no guarda quién tiene una tarea ni si está pausada: tgm_estadosof_olanet
// solo trae orden, fase, estado y fecha. Está en OLANET: scg_Fases (un boletín
// por OF y fase) y sch_FasesMov (cada movimiento de ese boletín, con su
// operario_id, que es el CodEmployee de RPS).
//
// Por página y en dos pasos: preguntar por todas las tareas pausadas de golpe
// pasó de 3 minutos. Así son 538 ms para 40 OF (medido el 15/09/2026).
//
// LOS TIPOS NO SON OPCIONALES: Orden es varchar(20) e IdBoletin bigint. Un
// texto sin tipo viaja como nvarchar, SQL Server convierte la columna fila a
// fila y no usa el índice de Orden: 5.522 ms contra 8 ms para las mismas OF.

/** Misma clave con la que publico-db.ts junta las tareas de RPS: código de OF
 *  y de tarea tal cual, sin normalizar el cero de delante (hay OF con la tarea
 *  "2" y la "02" a la vez, y son tareas distintas). */
export const claveFase = (orden: string, fase: string): string => `${orden.trim()}:${fase.trim()}`;

export interface UltimoMovimiento {
  estado: number;
  /** `CodEmployee` de quien lo movió, o null. */
  operario: string | null;
  fecha: Date | null;
}

/** Muy por debajo del tope de 2.100 parámetros de SQL Server. */
const TROZO = 500;

function trozos<T>(lista: readonly T[]): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += TROZO) salida.push(lista.slice(i, i + TROZO));
  return salida;
}

/** Último movimiento de cada tarea de esas OF, por `claveFase`. Lanza si
 *  OLANET falla: decide quien llama qué hacer (la consulta sigue sin nombres). */
export async function ultimosMovimientos(ordenes: readonly string[]): Promise<Map<string, UltimoMovimiento>> {
  const salida = new Map<string, UltimoMovimiento>();
  const unicas = [...new Set(ordenes.map((o) => o.trim()).filter(Boolean))];
  if (unicas.length === 0) return salida;
  const pool = await getPoolOlanet();

  const faseDe = new Map<string, string>();
  for (const trozo of trozos(unicas)) {
    const req = pool.request();
    const marcas = trozo.map((o, i) => {
      req.input(`o${i}`, sql.VarChar(20), o);
      return `@o${i}`;
    });
    const r = await req.query<{ IdBoletin: string | number; Orden: string | null; Fase: string | null }>(
      `SELECT IdBoletin, Orden, Fase FROM dbo.scg_Fases WHERE Orden IN (${marcas.join(",")})`,
    );
    for (const f of r.recordset) {
      if (!f.Orden || !f.Fase) continue;
      faseDe.set(String(f.IdBoletin), claveFase(f.Orden, f.Fase));
    }
  }

  for (const trozo of trozos([...faseDe.keys()])) {
    const req = pool.request();
    const marcas = trozo.map((b, i) => {
      req.input(`b${i}`, sql.BigInt, b);
      return `@b${i}`;
    });
    const r = await req.query<{
      IdBoletin: string | number;
      IdEstadoOF: number;
      operario_id: string | number | null;
      dhMovimiento: Date | null;
    }>(`SELECT IdBoletin, IdEstadoOF, operario_id, dhMovimiento
        FROM dbo.sch_FasesMov WHERE IdBoletin IN (${marcas.join(",")})`);
    for (const f of r.recordset) {
      const clave = faseDe.get(String(f.IdBoletin));
      if (!clave) continue;
      const previo = salida.get(clave);
      const cuando = f.dhMovimiento?.getTime() ?? -Infinity;
      // Una OF y fase puede tener más de un boletín: manda el movimiento más
      // reciente de cualquiera de ellos.
      if (previo && (previo.fecha?.getTime() ?? -Infinity) > cuando) continue;
      const operario = f.operario_id === null ? "" : String(f.operario_id).trim();
      salida.set(clave, { estado: f.IdEstadoOF, operario: operario || null, fecha: f.dhMovimiento });
    }
  }
  return salida;
}
