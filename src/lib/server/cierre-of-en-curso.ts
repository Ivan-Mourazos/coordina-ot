// ─── OF que se están dando por terminadas en RPS ahora mismo ─────────────────
// «Dar por terminada en RPS» comprueba que no queda tiempo de la OF por subir y
// después escribe el 3. Entre una cosa y otra pasan segundos de red con OLANET,
// y si alguien empezara a fichar en esa OF en ese hueco, su movimiento 1 iría
// DETRÁS del 3 y reabriría la operación recién cerrada.
//
// Mientras dura el cierre, la orden queda apuntada aquí y POST /api/fichaje
// rechaza abrir reloj en ella. Basta con memoria: CoordinaOT corre en un solo
// proceso, y si se reinicia a mitad el cierre se corta con él.
//
// En `globalThis` y no en una variable del módulo: Next puede cargar este
// fichero una vez por ruta, y las dos rutas tienen que ver la misma lista.

const CLAVE = Symbol.for("coordina.cierresOFEnCurso");
type ConLista = typeof globalThis & { [CLAVE]?: Set<string> };

function lista(): Set<string> {
  const g = globalThis as ConLista;
  return (g[CLAVE] ??= new Set<string>());
}

/** La orden del id de la OF ("0232086:9" → "0232086"). Se bloquea la ORDEN
 *  entera: con la trampa 2/02 se cierran las dos operaciones, y fichar en
 *  cualquiera de ellas reabriría una. */
function ordenDe(ofId: string): string {
  return ofId.split(":")[0];
}

/** Apunta la OF como en cierre. Devuelve `false` si ya lo estaba: otra
 *  pulsación va por delante y esta no debe seguir. */
export function empezarCierreOF(ofId: string): boolean {
  const orden = ordenDe(ofId);
  if (lista().has(orden)) return false;
  lista().add(orden);
  return true;
}

export function terminarCierreOF(ofId: string): void {
  lista().delete(ordenDe(ofId));
}

/** ¿Alguna de estas OF se está dando por terminada ahora? Devuelve la primera. */
export function ofEnCierre(ofIds: readonly string[]): string | null {
  return ofIds.find((id) => lista().has(ordenDe(id))) ?? null;
}
