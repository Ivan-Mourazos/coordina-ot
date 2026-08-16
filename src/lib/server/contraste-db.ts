import sql from "mssql";
import type { FilaOlanet } from "../contraste";
import { getPoolOlanet } from "./db";

// ─── Lectura de sch_RPS_bonos para el contraste ──────────────────────────────
// Solo lee. Se acota siempre por máquina y por días: la tabla ronda el medio
// millón de filas y el informe mira, como mucho, las dos últimas semanas.

/** Todas las líneas de tiempo de esa máquina en esos días, vengan de donde
 *  vengan. Separarlas por herramienta es cosa de `contrastar`, que sabe cuáles
 *  son nuestras; aquí se traen mezcladas a propósito. */
export async function leerBonosDe(
  dias: readonly string[],
  maquina: string,
): Promise<FilaOlanet[]> {
  if (dias.length === 0) return [];
  const peticion = (await getPoolOlanet())
    .request()
    .input("maquina", sql.VarChar(50), maquina);
  // Parametrizado uno a uno: los días salen de nuestra propia cola, pero
  // concatenarlos en el SQL sería abrir la puerta por costumbre.
  const marcas = dias.map((d, i) => {
    peticion.input(`d${i}`, sql.DateTime, new Date(`${d}T00:00:00Z`));
    return `@d${i}`;
  });
  const r = await peticion.query<{
    of: string;
    numope: string;
    operario: string;
    ini: Date;
    horaini: string | number;
    horafin: string | number;
  }>(
    `SELECT [of], numope, operario, ini, horaini, horafin
       FROM sch_RPS_bonos
      WHERE maquina = @maquina
        AND ini IN (${marcas.join(", ")})`,
  );
  return r.recordset.map((f) => ({
    of: (f.of ?? "").trim(),
    numope: (f.numope ?? "").trim(),
    operario: (f.operario ?? "").trim(),
    // `ini` es un DATETIME a medianoche UTC (así lo escribe insertarBono), así
    // que el día se lee del ISO sin pasar por la zona local.
    ini: f.ini.toISOString().slice(0, 10),
    horaini: Number(f.horaini),
    horafin: Number(f.horafin),
  }));
}
