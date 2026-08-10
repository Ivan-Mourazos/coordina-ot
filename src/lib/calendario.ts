import { sumarDias } from "./fechas";

// ─── La cuadrícula de un mes ─────────────────────────────────────────────────
// Aritmética de calendario, sin React, para poder probarla: los fallos de este
// tipo de código son de días concretos —el cambio de mes, la semana partida, el
// año bisiesto— y con un componente montado no se prueban, se miran de reojo.
//
// Todo en ISO yyyy-mm-dd y en hora LOCAL. Nada de `new Date(iso)` a secas: eso
// interpreta la cadena como UTC y en España devuelve el día anterior a partir
// de medianoche, que es justo el error que hace que "hoy" salga en la casilla
// de ayer.

export const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"] as const;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

/** Un ISO a sus partes, sin pasar por Date. */
const partes = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return { a, m, d };
};

export const iso = (a: number, m: number, d: number): string =>
  `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** "agosto de 2026", para la cabecera del mes. */
export function nombreMes(isoDia: string): string {
  const { a, m } = partes(isoDia);
  return `${MESES[m - 1]} de ${a}`;
}

/** El día 1 del mes que contiene `isoDia`. */
export const primerDiaDelMes = (isoDia: string): string => {
  const { a, m } = partes(isoDia);
  return iso(a, m, 1);
};

/** Mueve `n` meses. Si el día no existe en el destino (31 de enero → febrero)
 *  cae al último del mes, que es lo que espera cualquiera al pulsar "siguiente"
 *  y no el 3 de marzo. */
export function sumarMeses(isoDia: string, n: number): string {
  const { a, m, d } = partes(isoDia);
  const total = a * 12 + (m - 1) + n;
  const aNuevo = Math.floor(total / 12);
  const mNuevo = (total % 12) + 1;
  return iso(aNuevo, mNuevo, Math.min(d, diasDelMes(aNuevo, mNuevo)));
}

export function diasDelMes(a: number, m: number): number {
  // Día 0 del mes siguiente = último del actual. Con `Date` local, que aquí sí
  // vale porque se construye con números y no se parsea ninguna cadena.
  return new Date(a, m, 0).getDate();
}

/** Día de la semana con el LUNES como 0, que es como se lee un calendario aquí
 *  (`Date.getDay()` pone el domingo primero). */
export function diaSemanaLunes(isoDia: string): number {
  const { a, m, d } = partes(isoDia);
  return (new Date(a, m - 1, d).getDay() + 6) % 7;
}

/** Las seis semanas de la cuadrícula del mes de `isoDia`, con los días de los
 *  meses vecinos rellenando los huecos.
 *
 *  Seis filas SIEMPRE, aunque el mes quepa en cinco: si la rejilla cambia de
 *  alto al pasar de mes, el popover da un salto y los botones se mueven bajo el
 *  dedo justo cuando se está pulsando "siguiente" varias veces seguidas. */
export function semanasDelMes(isoDia: string): { iso: string; delMes: boolean }[][] {
  const primero = primerDiaDelMes(isoDia);
  const { m } = partes(primero);
  const arranque = sumarDias(primero, -diaSemanaLunes(primero));

  const semanas: { iso: string; delMes: boolean }[][] = [];
  for (let s = 0; s < 6; s++) {
    const fila: { iso: string; delMes: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const dia = sumarDias(arranque, s * 7 + d);
      fila.push({ iso: dia, delMes: partes(dia).m === m });
    }
    semanas.push(fila);
  }
  return semanas;
}

/** El lunes y el domingo de la semana de `isoDia`. */
export function semanaDe(isoDia: string): { desde: string; hasta: string } {
  const lunes = sumarDias(isoDia, -diaSemanaLunes(isoDia));
  return { desde: lunes, hasta: sumarDias(lunes, 6) };
}

/** Cómo se lee el filtro puesto, para el botón cerrado.
 *
 *  Un día suelto se dice con su fecha; un rango, con las dos. Vacío devuelve
 *  null y el botón enseña su nombre ("Planificado"), igual que los demás
 *  filtros de la barra. */
export function resumenRango(desde: string, hasta: string): string | null {
  if (!desde && !hasta) return null;
  const corto = (d: string) => {
    const { m, d: dia } = partes(d);
    return `${dia}/${m}`;
  };
  if (desde && hasta && desde === hasta) return corto(desde);
  if (desde && hasta) return `${corto(desde)} → ${corto(hasta)}`;
  return desde ? `desde ${corto(desde)}` : `hasta ${corto(hasta!)}`;
}
