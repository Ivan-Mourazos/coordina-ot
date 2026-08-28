import { stat } from "node:fs/promises";
import { OPERARIO_SISTEMA, textoNotaReescaneo } from "../pedido-scan";
import { crearNota } from "./notas-db";
import { anotarMtime, pedidosParaRevisar } from "./scan-db";
import { rutaPdfPedido } from "./pdf-pedido";

// ─── Vigilante del parte escaneado ───────────────────────────────────────────
// A veces vuelven a escanear el parte de un pedido que ya estaba en marcha.
// Hasta ahora nada lo señalaba y quien ya lo había leído seguía con la versión
// vieja en la cabeza.
//
// POR QUÉ UN WORKER Y NO MIRARLO AL PINTAR EL TABLERO. El `stat` va contra un
// share por red (SMB, y en desarrollo por VPN). El tablero lleva unos 81
// pedidos y se refresca cada 30 s: mirarlos ahí serían 81 idas y venidas por
// red cada media vuelta de reloj, metidas en el camino de la respuesta. Aquí
// van fuera, a ritmo lento, y el tablero lee lo ya sabido de SQLite.
//
// A QUIÉN MIRA. Solo a lo que `getTablero()` haya registrado, así que este
// worker NO le pregunta nada a RPS: esa consulta tarda de 7 a 15 s.

/** Cada cuánto sale una tanda. */
const CADA_MS = 60_000;

/** Cuántos partes se miran por tanda.
 *
 *  Con 81 pedidos vivos y una tanda por minuto, cada uno queda mirado como
 *  mucho cada 9 minutos: de sobra para un parte que se re-escanea como mucho
 *  una vez al día, y sin plantarle al share 81 peticiones de golpe. */
const POR_TANDA = 10;

/** Tope de espera de un `stat`. Con el share caído o la VPN dormida, la llamada
 *  se queda colgada; sin este corte una tanda podría no terminar nunca y el
 *  vigilante quedaría muerto sin decir nada. */
const ESPERA_MAX_MS = 5_000;

let temporizador: NodeJS.Timeout | null = null;

async function conTope<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, no) => {
        t = setTimeout(() => no(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

/** El mtime del parte, o null si no está o no se pudo mirar.
 *
 *  Los dos casos se responden igual A PROPÓSITO: `anotarMtime` no toca la
 *  referencia con un null, así que un share caído no puede hacer que al volver
 *  el fichero de siempre parezca recién escaneado. */
async function mtimeDelParte(pedido: string): Promise<number | null> {
  const ruta = rutaPdfPedido(pedido);
  if (!ruta) return null; // trabajo interno u OF suelta: no hay parte que escanear
  try {
    return (await conTope(stat(ruta), ESPERA_MAX_MS)).mtimeMs;
  } catch {
    return null;
  }
}

/** Una tanda: mira unos cuantos partes y, en los que hayan cambiado, deja la
 *  nota permanente en el hilo del pedido.
 *
 *  Devuelve cuántos estrenaron aviso (para los tests y para el registro). */
export async function revisarUnaTanda(porTanda = POR_TANDA): Promise<number> {
  const pedidos = pedidosParaRevisar(porTanda);
  let nuevos = 0;
  for (const pedido of pedidos) {
    const mtime = await mtimeDelParte(pedido);
    // `anotarMtime` devuelve true SOLO cuando estrena aviso, así que la nota
    // se escribe una vez por re-escaneo y no en cada vuelta.
    //
    // SIEMPRE se llama, también con `mtime` null: con null no toca la
    // referencia, pero sí deja apuntado que el pedido se ha mirado, y ese
    // apunte es lo único que mueve la cola. Cortocircuitar aquí el null
    // —como se hacía— dejaba a los pedidos sin parte (el trabajo interno,
    // los partes todavía sin escanear) con `revisado_at` nulo para siempre;
    // como la cola los pone primero, con POR_TANDA de ellos la tanda era
    // siempre la misma y la vigilancia se paraba entera sin decir nada.
    // El orden importa: `anotarMtime` va delante para que el apunte se haga
    // siempre. Lo de `mtime === null` es solo estrechar el tipo para la nota de
    // abajo —con null nunca devuelve true—, no una segunda regla.
    if (!anotarMtime(pedido, mtime) || mtime === null) continue;
    nuevos++;
    // La nota es el registro permanente que se pidió: se queda para siempre en
    // el hilo, también cuando el pedido pase al Historial. La firma
    // `sistema` no es de nadie, así que nadie puede editarla ni borrarla.
    crearNota(pedido, OPERARIO_SISTEMA, textoNotaReescaneo(mtime));
  }
  return nuevos;
}

/** Arranca la vigilancia. Idempotente: dos llamadas dejan un solo temporizador. */
export function arrancarVigilanciaDePartes(): void {
  if (temporizador) return;
  temporizador = setInterval(() => {
    void revisarUnaTanda().catch((e) => {
      // Que una tanda falle no puede matar la vigilancia: la siguiente lo
      // reintenta y los pedidos sin revisar van los primeros de la cola.
      console.warn("[coordina] vigilancia de partes:", (e as Error).message);
    });
  }, CADA_MS);
  // Sin `unref` el proceso no terminaría solo al pararlo.
  temporizador.unref?.();
}

/** Para la vigilancia (tests). */
export function pararVigilanciaDePartes(): void {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
}
