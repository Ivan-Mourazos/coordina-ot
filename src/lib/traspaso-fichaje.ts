import { bonosDe, claveBonoRps } from "./bonos";
import type { Intervalo } from "./fichaje";

// ─── Quién cuenta el tiempo cuando el fichaje empieza a subir a RPS ──────────
// Hoy el tiempo de CoordinaOT se SUMA al que trae RPS, y está bien porque son
// trabajos distintos: lo de RPS entró por el terminal de siempre y lo de aquí
// no ha salido de aquí (en modo sombra/ensayo los bonos no se procesan).
//
// En cuanto el modo pase a `activo` eso deja de ser cierto: OLANET recoge
// nuestros bonos, los sube a RPS, y a partir de ese momento los MISMOS minutos
// están en los dos sitios. Sumarlos los contaría dos veces.
//
// La regla es: **manda RPS en cuanto lo tenga**. Un tramo cuenta en local hasta
// que se confirma que ya está traspasado, y desde entonces cuenta por RPS —
// donde además sale con su dueño en el desglose. Así el tiempo no se duplica ni
// desaparece mientras está en camino.
//
// Un tramo se traduce a uno o varios bonos (uno por OF, y partidos por
// medianoche), así que solo se da por traspasado cuando lo están TODOS: si
// OLANET procesó la mitad, el resto todavía tiene que contar desde aquí.

/** ¿Está ya en RPS todo el tiempo de este tramo?
 *
 *  `yaEnRps` son claves de bono (ver `claveBonoRps`) que OLANET ya marcó como
 *  traspasadas. Un tramo sin bonos —porque ninguna de sus OFs se pudo traducir,
 *  o porque el operario no tiene código de RPS— nunca se da por traspasado: su
 *  tiempo no ha salido de aquí y esta es la única fuente que lo tiene. */
export function intervaloYaEnRps(
  iv: Intervalo,
  codigosRps: Readonly<Record<string, string>>,
  yaEnRps: ReadonlySet<string>,
): boolean {
  // Un tramo abierto no ha generado bonos todavía: se está fichando ahora.
  if (iv.fin === null) return false;
  let bonos;
  try {
    bonos = bonosDe([iv], codigosRps);
  } catch {
    return false; // sin código de RPS no hay bono que traspasar
  }
  return bonos.length > 0 && bonos.every((b) => yaEnRps.has(claveBonoRps(b)));
}

/** Los días (YYYY-MM-DD, hora del taller) y operarios que tocan estos tramos.
 *
 *  Es por lo que se pregunta a OLANET: `sch_RPS_bonos` está indexada por día y
 *  tiene medio millón de filas, así que se acota por ahí y luego se cruza en
 *  memoria por la clave exacta del bono. Preguntar bono a bono serían decenas
 *  de consultas por vuelta para no traer más información. */
export function diasYOperariosDe(
  intervalos: readonly Intervalo[],
  codigosRps: Readonly<Record<string, string>>,
): { dias: string[]; operarios: string[] } {
  const dias = new Set<string>();
  const operarios = new Set<string>();
  for (const iv of intervalos) {
    if (iv.fin === null) continue;
    let bonos;
    try {
      bonos = bonosDe([iv], codigosRps);
    } catch {
      continue;
    }
    for (const b of bonos) {
      dias.add(b.ini);
      operarios.add(b.operario);
    }
  }
  return { dias: [...dias].sort(), operarios: [...operarios].sort() };
}
