// Cuánto tiempo de TURNO hay entre dos momentos (Iván, 23/11/2026).
//
// Las estadísticas medían a reloj corrido: una OF devuelta el viernes a las
// 14:50 que se corregía el lunes a las 8:00 sumaba 65 horas de «espera», cuando
// el equipo solo estuvo 10 minutos en la oficina en ese tiempo. Aquí se cuenta
// solo lo que cae dentro del turno de Oficina Técnica: de lunes a viernes, de
// 7:00 a 15:00, sin festivos.
//
// Siempre en hora de Madrid, NO en la local: el servidor despliega en UTC (ver
// fechas.ts) y con la local el turno empezaría a las 8:00 o 9:00 según la época.

export const TURNO = { inicio: 7, fin: 15 } as const;

/** Minutos de una jornada completa. Sirve para pintar «días» de turno. */
export const MINUTOS_JORNADA = (TURNO.fin - TURNO.inicio) * 60;

/** Días entre semana sin trabajo: festivos y días de cierre de la empresa (los
 *  de 24/12 y 31/12, y los puentes). Los de fin de semana no hace falta
 *  ponerlos, pero no estorban. Un año sin lista solo cuenta esos días como
 *  laborables, no rompe nada.
 *
 *  Para 2027 la idea es sacarlos de Bizneo (Iván, 23/11/2026), que ya tiene el
 *  calendario de la empresa; si no hay token para entonces, se añaden aquí. */
export const FESTIVOS: ReadonlySet<string> = new Set([
  // 2026 — nacionales
  "2026-01-01", "2026-01-06", "2026-04-03", "2026-05-01", "2026-08-15",
  "2026-10-12", "2026-11-01", "2026-12-06", "2026-12-08", "2026-12-25",
  // 2026 — vacaciones de empresa (en azul en el calendario de Bizneo)
  "2026-12-07", "2026-12-24", "2026-12-31",
]);

const ZONA = "Europe/Madrid";
const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtHora = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

/** El día de Madrid en que cae un instante, yyyy-mm-dd. */
function diaMadrid(ms: number): string {
  return fmtDia.format(ms);
}

/** Minutos que Madrid va por delante de UTC en ese instante (60 o 120). */
function desfase(ms: number): number {
  const p = Object.fromEntries(fmtHora.formatToParts(ms).map((x) => [x.type, x.value]));
  const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((comoUtc - Math.floor(ms / 60000) * 60000) / 60000);
}

/** El instante de un día a una hora en punto de Madrid. El cambio de hora es de
 *  madrugada, así que dentro del turno el desfase del día no varía. */
function aLas(dia: string, hora: number): number {
  const [a, m, d] = dia.split("-").map(Number);
  const guess = Date.UTC(a, m - 1, d, hora);
  return guess - desfase(guess) * 60000;
}

function siguienteDia(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

export function esLaborable(dia: string): boolean {
  const [a, m, d] = dia.split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return dow !== 0 && dow !== 6 && !FESTIVOS.has(dia);
}

/** La ventana del turno de cada día, cacheada: un año de registro mide miles de
 *  tramos y casi todos repiten días. */
const ventanas = new Map<string, readonly [number, number] | null>();
function ventana(dia: string): readonly [number, number] | null {
  let v = ventanas.get(dia);
  if (v === undefined) {
    v = esLaborable(dia) ? [aLas(dia, TURNO.inicio), aLas(dia, TURNO.fin)] : null;
    ventanas.set(dia, v);
  }
  return v;
}

/** Minutos de turno entre dos instantes ISO. Lo que cae de noche, en fin de
 *  semana o en festivo no cuenta. Un rango al revés o ilegible da NaN, igual
 *  que la resta a pelo, para que quien llama lo descarte como hasta ahora.
 *
 *  `fichado`: ratos en que alguien fichó en esa OF. Lo que caiga fuera del
 *  turno SÍ cuenta (Iván, 23/11/2026): si alguien se quedó una tarde o vino un
 *  sábado, ese tiempo pasó de verdad. Lo que se solapa con el turno no se
 *  cuenta dos veces, y varios fichajes a la vez tampoco. */
export function minutosLaborables(
  desde: string,
  hasta: string,
  fichado: readonly { inicio: string; fin?: string | null }[] = [],
): number {
  const a = Date.parse(desde);
  const b = Date.parse(hasta);
  if (!(b >= a)) return NaN;
  const tramos: [number, number][] = [];
  const mete = (ini: number, fin: number) => {
    const x = Math.max(a, ini);
    const y = Math.min(b, fin);
    if (y > x) tramos.push([x, y]);
  };
  const ultimo = diaMadrid(b);
  for (let dia = diaMadrid(a); dia <= ultimo; dia = siguienteDia(dia)) {
    const v = ventana(dia);
    if (v) mete(v[0], v[1]);
  }
  for (const f of fichado) if (f.fin) mete(Date.parse(f.inicio), Date.parse(f.fin));
  // Unión de tramos: ordenados por inicio, cada uno solo suma lo que asoma
  // por detrás del anterior.
  tramos.sort((p, q) => p[0] - q[0]);
  let total = 0;
  let hastaAhora = -Infinity;
  for (const [ini, fin] of tramos) {
    const desdeAqui = Math.max(ini, hastaAhora);
    if (fin > desdeAqui) total += fin - desdeAqui;
    hastaAhora = Math.max(hastaAhora, fin);
  }
  return total / 60000;
}
