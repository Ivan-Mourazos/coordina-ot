import type { Intervalo } from "./fichaje";

// ─── Traducción de intervalos a filas de sch_RPS_bonos ───────────────────────
// Funciones puras: convierten el fichaje de CoordinaOT al formato que espera
// OLANET. No tocan la BD; quien escribe es la capa de servidor.
//
// Dos reglas que salen de mirar el histórico de A-OTEC (mini-olanet de OT):
//
//  1. Un tramo compartido por N OFs se parte en N sub-tramos IGUALES y
//     CONSECUTIVOS, pegados uno al otro y cubriendo el tramo real de punta a
//     punta. Así el tiempo se reparte en vez de duplicarse. (Ojo: las máquinas
//     de taller como A-ROTU sí duplican el tramo entero en cada OF; ese NO es
//     el comportamiento de Oficina Técnica.)
//
//  2. `ini`/`fin` son la FECHA a medianoche y `horaini`/`horafin` los SEGUNDOS
//     transcurridos desde esa medianoche, en hora local del taller. El correo
//     de IT decía "milisegundos", pero los datos reales dicen segundos
//     (p.ej. 62004 = 17:13:24).

/** Hora del taller. Los segundos son de reloj de pared, así que hay que fijar
 *  la zona: el servidor de deploy corre en UTC y en verano el desfase es de
 *  2 h, suficiente para mandar los bonos a otro turno. */
const TZ_TALLER = "Europe/Madrid";

const DIA_S = 86_400;

/** Columnas que en OLANET van siempre con el mismo valor. Salen de mirar la
 *  fila típica de sch_RPS_bonos (385.343 de 510.388 filas con esta combinación).
 *  `id` es IDENTITY: no se cubre. */
export const BONO_FIJO = {
  empresa: "001",
  numbono: "1",
  numsec: "0",
  tipo: "P",
  tipohora: "0",
  buenas: 0,
  malas: 0,
  motivo: "0",
  devueltas: "0",
  causadev: "0",
  terminado: "N",
  valoresextra: "dv2:-;",
} as const;

/** Máquina de Oficina Técnica. Confirmado por IT el 2026-08-04: **A-OTEC** es
 *  la nuestra; A-OTECP es una máquina de OT en planta, para la fábrica. */
export const MAQUINA_OT = "A-OTEC";

/** Valores de `traspasado` (confirmado por IT):
 *  · 0 = pendiente de traspasar. Es el que hay que escribir: los procedimientos
 *    de OLANET lo recogen y suben el tiempo a RPS.
 *  · 2 y 3 = estados internos de OLANET; significan que ya está pasado.
 *
 *  Por eso un bono con 2 nunca se procesa, y de ahí el modo "ensayo": escribir
 *  en la tabla real sin que el tiempo llegue a RPS. */
export const TRASPASADO_PENDIENTE = 0;
export const TRASPASADO_NO_PROCESAR = 2;

/** Una fila de sch_RPS_bonos, con los nombres de columna tal cual están en la
 *  tabla (minúsculas incluidas) para que el INSERT se lea igual que el DDL. */
export interface FilaBono {
  empresa: string;
  of: string;
  numope: string;
  numbono: string;
  numsec: string;
  operario: string;
  maquina: string;
  ini: string; // "YYYY-MM-DD" en hora del taller
  horaini: number; // segundos desde medianoche
  fin: string;
  horafin: number;
  tipo: string;
  tipohora: string;
  buenas: number;
  malas: number;
  motivo: string;
  devueltas: string;
  causadev: string;
  terminado: string;
  valoresextra: string;
  traspasado: number;
}

const FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ_TALLER,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Fecha y segundos desde medianoche, en hora del taller. */
export function partesLocales(ms: number): { fecha: string; segundos: number } {
  const p: Record<string, string> = {};
  for (const parte of FMT.formatToParts(new Date(ms))) p[parte.type] = parte.value;
  return {
    fecha: `${p.year}-${p.month}-${p.day}`,
    segundos: Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second),
  };
}

/** Instante de la primera medianoche local posterior a `ms`. Se busca por
 *  bisección sobre el cambio de fecha en vez de sumar 86400 s: los días de
 *  cambio de hora duran 23 o 25 h y la suma se desviaría una hora entera. */
function siguienteMedianoche(ms: number): number {
  const dia = partesLocales(ms).fecha;
  let lo = ms;
  let hi = ms + 2 * DIA_S * 1000; // 2 días cubren cualquier día con DST
  while (hi - lo > 1000) {
    const medio = lo + Math.floor((hi - lo) / 2);
    if (partesLocales(medio).fecha === dia) lo = medio;
    else hi = medio;
  }
  return hi - (hi % 1000); // al segundo exacto
}

/** Identifica una línea de tiempo en `sch_RPS_bonos` sin depender de su `id`,
 *  que es IDENTITY y lo pone OLANET.
 *
 *  Estas cinco columnas son las que hacen única a una fila nuestra: la misma
 *  persona no puede tener dos tramos que empiecen en el mismo segundo del mismo
 *  día sobre la misma OF y tarea. Se usa para dos cosas que tienen que hablar
 *  del mismo bono: no encolar dos veces el mismo evento (olanet-outbox) y
 *  reconocer después cuáles ya se traspasaron a RPS (traspaso-fichaje). */
export function claveBonoRps(
  f: Pick<FilaBono, "of" | "numope" | "operario" | "ini" | "horaini">,
): string {
  return [f.of, f.numope, f.operario, f.ini, f.horaini].join("|");
}

/** El id de OF de CoordinaOT es "orden:codTarea" (ver rps.ts). `numope` es el
 *  codTarea; sin él el bono no se puede imputar a ninguna tarea de RPS. */
export function partirOfId(ofId: string): { of: string; numope: string } | null {
  const i = ofId.indexOf(":");
  if (i <= 0) return null;
  const of = ofId.slice(0, i).trim();
  const numope = ofId.slice(i + 1).trim();
  return of && numope ? { of, numope } : null;
}

/** Un sub-tramo [desde, hasta) en ms, partido por medianoche local para que
 *  cada trozo caiga entero dentro de un día. */
function filasDeTramo(
  desde: number,
  hasta: number,
  of: string,
  numope: string,
  operario: string,
): FilaBono[] {
  const filas: FilaBono[] = [];
  let cursor = desde;
  while (cursor < hasta) {
    const corte = Math.min(siguienteMedianoche(cursor), hasta);
    const a = partesLocales(cursor);
    const b = partesLocales(corte);
    filas.push({
      ...BONO_FIJO,
      of,
      numope,
      operario,
      maquina: MAQUINA_OT,
      ini: a.fecha,
      horaini: a.segundos,
      fin: a.fecha,
      // A medianoche `partesLocales` devuelve el día siguiente con 0 s; el
      // bono se cierra a 86400 del día que empezó para no perder ese trozo.
      horafin: b.fecha === a.fecha ? b.segundos : DIA_S,
      traspasado: TRASPASADO_PENDIENTE,
    });
    cursor = corte;
  }
  return filas;
}

/** Filas de sch_RPS_bonos para unos intervalos ya cerrados.
 *
 *  `codigosRps` mapea el operario del tablero a su código de empleado en RPS.
 *  Si falta, se lanza: un bono con el operario equivocado (o vacío) ensucia
 *  las imputaciones de otra persona y no hay forma limpia de deshacerlo. */
export function bonosDe(
  intervalos: readonly Intervalo[],
  codigosRps: Readonly<Record<string, string>>,
): FilaBono[] {
  const filas: FilaBono[] = [];
  for (const iv of intervalos) {
    if (iv.fin === null) continue; // sigue corriendo: aún no es un bono
    const desde = Date.parse(iv.inicio);
    const hasta = Date.parse(iv.fin);
    if (!(hasta > desde)) continue; // duración cero o datos corruptos

    const operario = codigosRps[iv.operarioId];
    if (!operario) {
      throw new Error(
        `El operario "${iv.operarioId}" no tiene código de empleado en RPS: no se puede fichar en su nombre`,
      );
    }

    const ofs = iv.ofIds.map(partirOfId).filter((x): x is { of: string; numope: string } => x !== null);
    if (ofs.length === 0) continue;

    // Reparto: N sub-tramos consecutivos. Los cortes se calculan sobre el
    // total (no sumando una duración fija) para que el redondeo no acumule
    // deriva y el último acabe justo en `hasta`.
    const total = hasta - desde;
    for (let i = 0; i < ofs.length; i++) {
      const a = i === 0 ? desde : desde + Math.floor((total * i) / ofs.length);
      const b = i === ofs.length - 1 ? hasta : desde + Math.floor((total * (i + 1)) / ofs.length);
      filas.push(...filasDeTramo(a, b, ofs[i].of, ofs[i].numope, operario));
    }
  }
  return filas;
}
