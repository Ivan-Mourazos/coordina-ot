import type { Tablero } from "../data";
import type { Intervalo } from "../fichaje";
import { minutosOF, type Fichaje } from "../fichaje";

// ─── Tiempo de fichaje agregado por OF ───────────────────────────────────────
// Suma pura: trata TODOS los intervalos (de todos los operarios) como una sola
// lista y reparte por OF y rol con minutosOF. Añade el resultado a los minutos
// que ya trae la OF de base (mock/RPS). Un intervalo abierto cuenta hasta
// `ahora` (la hora del server), así el tiempo en curso también se ve.

export function aplicarTiemposFichaje(
  tablero: Tablero,
  intervalos: Intervalo[],
  ahora: string,
): Tablero {
  if (intervalos.length === 0) return tablero;
  const f: Fichaje = { intervalos };
  return {
    operarios: tablero.operarios,
    pedidos: tablero.pedidos.map((p) => {
      let cambiado = false;
      const ofs = p.ofs.map((of) => {
        const planteo = minutosOF(f, of.id, { rol: "plantear", ahora });
        const revision = minutosOF(f, of.id, { rol: "revisar", ahora });
        if (planteo === 0 && revision === 0) return of;
        cambiado = true;
        return {
          ...of,
          tiempoPlanteoMin: of.tiempoPlanteoMin + planteo,
          tiempoRevisionMin: of.tiempoRevisionMin + revision,
        };
      });
      return cambiado ? { ...p, ofs } : p;
    }),
  };
}
