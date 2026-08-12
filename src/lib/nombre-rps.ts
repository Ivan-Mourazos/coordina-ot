/** "CARBON SEXTO, ALBERTO" → "ALBERTO CARBON SEXTO".
 *
 *  RPS guarda los nombres del revés, apellidos primero, que es como se ordena
 *  una lista pero no como se lee un nombre. Se usa solo para la gente que NO
 *  está en el mapa de operarios de Oficina Técnica: a los de casa se les llama
 *  por su nombre del tablero ("Alberto"), que es el que se usa en toda la app.
 *
 *  Sin coma se devuelve tal cual: no hay nada que dar la vuelta, y adivinar
 *  dónde acaban los apellidos sería inventar. */
export function nombreRps(nombre: string): string {
  const limpio = nombre.trim().replace(/\s+/g, " ");
  const coma = limpio.indexOf(",");
  if (coma < 0) return limpio;
  const apellidos = limpio.slice(0, coma).trim();
  const pila = limpio.slice(coma + 1).trim();
  return pila && apellidos ? `${pila} ${apellidos}` : pila || apellidos;
}
