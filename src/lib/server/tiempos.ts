import type { Tablero } from "../data";
import type { Intervalo } from "../fichaje";
import { minutosOF, minutosPorOperarioOF, type Fichaje } from "../fichaje";

// ─── Tiempo de fichaje agregado por OF ───────────────────────────────────────
// Suma pura: trata TODOS los intervalos (de todos los operarios) como una sola
// lista y reparte por OF y rol con minutosOF. Un intervalo abierto cuenta hasta
// `ahora` (la hora del server), así el tiempo en curso también se ve.
//
// Lo que se hace con ese reparto depende de si OT está fichando en las DOS
// herramientas a la vez, que es el estado normal mientras el fichaje no pase a
// `activo`:
//
//  · Doble fichaje (sombra o ensayo). El mismo trabajo se apunta aquí y en el
//    terminal de siempre, así que RPS y la web dicen lo mismo, no dos cosas que
//    haya que sumar. Sumarlas daba el doble: una OF con 2 h de trabajo salía
//    con 4. El total pasa a ser el MAYOR de los dos —el que más se acerque al
//    trabajo real— y las dos cifras quedan guardadas aparte para poder
//    contrastarlas (ver `planteoWebMin` en types.ts).
//
//  · Activo. El tiempo sube a RPS POR la web, así que ya no hay nada que
//    duplicar y se suma como siempre. Y no se cuenta dos veces cuando OLANET lo
//    traspasa: `confirmarTraspasos` sella el tramo y deja de venir en
//    `leerTodosIntervalos`.

export interface OpcionesTiempos {
  /** OT sigue fichando también en la herramienta vieja. Es el caso mientras
   *  `FICHAJE_OLANET` no sea `activo`. */
  dobleFichaje: boolean;
}

export function aplicarTiemposFichaje(
  tablero: Tablero,
  intervalos: Intervalo[],
  ahora: string,
  opciones: OpcionesTiempos = { dobleFichaje: true },
): Tablero {
  if (intervalos.length === 0) return tablero;
  const f: Fichaje = { intervalos };
  return {
    operarios: tablero.operarios,
    pedidos: tablero.pedidos.map((p) => {
      let cambiado = false;
      const ofs = p.ofs.map((of) => {
        const planteoWeb = minutosOF(f, of.id, { rol: "plantear", ahora });
        const revisionWeb = minutosOF(f, of.id, { rol: "revisar", ahora });
        if (planteoWeb === 0 && revisionWeb === 0) return of;
        cambiado = true;
        const base = {
          ...of,
          planteoWebMin: planteoWeb,
          revisionWebMin: revisionWeb,
          fichadoWeb: minutosPorOperarioOF(f, of.id, { ahora }),
        };

        if (!opciones.dobleFichaje) {
          return {
            ...base,
            tiempoPlanteoMin: of.tiempoPlanteoMin + planteoWeb,
            tiempoRevisionMin: of.tiempoRevisionMin + revisionWeb,
          };
        }

        // El total es el mayor de los dos relatos del mismo trabajo. Cuando
        // gana la web se respeta su reparto por rol; cuando gana RPS, el
        // sobrante va al planteo, que es lo que RPS mide: en su ruta no existe
        // la tarea de revisión, así que el rato de repasar que se fichó en la
        // herramienta vieja entró como planteo.
        const web = planteoWeb + revisionWeb;
        const rps = of.tiempoPlanteoMin;
        return web >= rps
          ? { ...base, tiempoPlanteoMin: planteoWeb, tiempoRevisionMin: revisionWeb }
          : {
              ...base,
              tiempoPlanteoMin: Math.max(0, rps - revisionWeb),
              tiempoRevisionMin: revisionWeb,
            };
      });
      return cambiado ? { ...p, ofs } : p;
    }),
  };
}
