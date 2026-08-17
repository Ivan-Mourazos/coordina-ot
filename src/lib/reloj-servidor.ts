// ─── El reloj que manda es el del servidor ───────────────────────────────────
// Todas las horas del fichaje las pone el servidor: `POST /api/fichaje` aplica
// el motor con SU hora y devuelve el intervalo ya sellado (ver la ruta). Eso
// está bien —así todos los tiempos salen del mismo reloj, vengan del portátil
// que vengan— pero deja una trampa en el navegador: en cuanto el cliente compara
// esa hora con la SUYA, está restando dos relojes distintos.
//
// Y no coinciden. Medido el 16/08/2026 contra el servidor de producción
// (192.168.0.90:4300): iba 60 segundos adelantado respecto al PC de la oficina.
// El efecto era justo el que se veía al fichar: se pulsa, el contador arranca
// bien un instante —porque el valor optimista usa la hora del cliente— y en
// cuanto llega la respuesta del servidor, `inicio` pasa a ser una hora que para
// el navegador está EN EL FUTURO. El contador calcula un tiempo negativo,
// `fmtHMS` lo recorta a cero, y se queda clavado en 0:00:00 hasta que el reloj
// del PC alcanza al del servidor. Un minuto entero mirando un cronómetro
// parado, y distinto en cada puesto según lo que derive cada máquina.
//
// La solución no es dejar de fiarse del servidor —su hora es la buena, es la que
// se guarda y la que sube a OLANET— sino que el navegador sepa cuánto se aparta
// la suya y lo descuente. El desfase sale de la cabecera `Date` de cualquier
// respuesta, que no hay que pedir aparte y viene en todas.
//
// OJO, esto NO arregla el reloj del servidor, solo deja de restar peras y
// manzanas en pantalla. Que un servidor vaya un minuto desviado es cosa de IT
// (ver MANUAL-IT.md): la duración de los bonos sale bien igual —inicio y fin
// vienen los dos de su reloj— pero la HORA a la que dicen que se trabajó no.

/** Cuánto se aparta el reloj del servidor del de este navegador, en ms.
 *  Positivo = el servidor va por delante.
 *
 *  `cabecera` es el `Date` de la respuesta HTTP y `recibidoEn` el `Date.now()`
 *  de cuando llegó. Devuelve `null` si la cabecera no viene o no se entiende:
 *  sin dato no se corrige nada, que es mejor que corregir a ciegas.
 *
 *  La cabecera `Date` va al segundo, así que esto tiene medio segundo de error
 *  de suelo. Da igual: lo que se está cazando son desfases de decenas de
 *  segundos, y para un cronómetro en pantalla medio segundo no se ve. */
export function desfaseDeCabecera(
  cabecera: string | null,
  recibidoEn: number,
): number | null {
  if (!cabecera) return null;
  const servidor = Date.parse(cabecera);
  if (Number.isNaN(servidor)) return null;
  return servidor - recibidoEn;
}

/** Desfase a partir del cual merece la pena corregir.
 *
 *  Por debajo de un par de segundos, corregir mete más ruido del que quita: la
 *  cabecera va al segundo y el viaje de ida y vuelta también cuenta, así que un
 *  "desfase" de 300 ms es medida, no reloj. Y a esa escala no se ve nada en
 *  pantalla — el problema empieza cuando el contador se queda parado. */
export const DESFASE_MINIMO_MS = 2_000;

/** La hora del servidor según este navegador. Es la que hay que usar para
 *  medir contra cualquier instante que venga del servidor.
 *
 *  Con el desfase por debajo del mínimo se devuelve la hora local tal cual: no
 *  se toca nada por unos milisegundos de nada. */
export function ahoraDelServidor(desfaseMs: number | null, ahoraLocal = Date.now()): number {
  if (desfaseMs === null || Math.abs(desfaseMs) < DESFASE_MINIMO_MS) return ahoraLocal;
  return ahoraLocal + desfaseMs;
}
