// ─── Freno a la fuerza bruta del PIN ─────────────────────────────────────────
// Un PIN de cuatro dígitos son 10 000 combinaciones: sin esto se prueban
// enteras en segundos con un bucle. Cinco fallos y un minuto de espera lo
// vuelve inviable —más de tres días para recorrerlas— sin molestar a nadie que
// se equivoque al teclear.
//
// EN MEMORIA a propósito: hay un solo proceso (PM2), y que un reinicio limpie
// la cuenta de fallos no le importa a nadie. Guardarlo en la base sería una
// escritura por cada intento fallido para el mismo efecto.
//
// Va en su propio módulo y no dentro de la ruta porque un route handler solo
// debe exportar sus verbos, y los tests necesitan poder reiniciar el contador.

export const TOPE_FALLOS = 5;
export const ESPERA_MS = 60_000;

const fallos = new Map<string, { veces: number; hasta: number }>();

/** ¿Está esta persona esperando su minuto? */
export function frenado(id: string): boolean {
  const f = fallos.get(id);
  return f !== undefined && f.veces >= TOPE_FALLOS && Date.now() < f.hasta;
}

/** Un intento fallido más. La cuenta se reinicia sola si el último fallo fue
 *  hace más de la espera: cinco erratas repartidas por la mañana no son un
 *  ataque, y encerrar a quien teclea mal de vez en cuando sobra. */
export function apuntarFallo(id: string): void {
  const f = fallos.get(id);
  const veces = f && Date.now() < f.hasta ? f.veces + 1 : 1;
  fallos.set(id, { veces, hasta: Date.now() + ESPERA_MS });
}

/** Borrón y cuenta nueva. Sin `id`, para todos (lo usan los tests). */
export function olvidarFallos(id?: string): void {
  if (id === undefined) fallos.clear();
  else fallos.delete(id);
}
