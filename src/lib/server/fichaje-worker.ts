import { abierto, cerrarPorInactividad, TOLERANCIA_LATIDO_MS } from "../fichaje";
import {
  guardarFichaje,
  leerFichaje,
  leerTodosIntervalos,
  leerUltimoLatido,
  registrarAvisoCierre,
} from "./fichaje-db";
import { encolarFichaje } from "./olanet-outbox";

// ─── Cierre de fichajes olvidados ────────────────────────────────────────────
// Vive APARTE del worker de OLANET a propósito: esto solo toca nuestra SQLite,
// así que tiene que correr siempre, también en desarrollo con datos mock. Si
// colgara de la sincronización con OLANET (que solo arranca con
// DATASOURCE=rps), un fichaje olvidado seguiría sumando horas en dev y el
// mecanismo no se podría ni probar.
//
// Qué resuelve: alguien cierra el portátil sin pausar y su intervalo se queda
// abierto. En una simulación real quedó uno corriendo 11 horas de noche, y ese
// tiempo se habría imputado a un pedido que nadie estaba haciendo.
//
// Qué NO resuelve, a propósito: el latido mide si la PESTAÑA sigue viva, no si
// la persona está delante. En Oficina Técnica mucho trabajo pasa lejos del
// teclado —medir, mirar el parte en papel, hablar con Producción—, así que
// detectar inactividad de ratón cortaría trabajo real. Que una ausencia corta
// siga contando está aceptado; se corrige sola cuando vuelves a lo mismo.

/** Cada cuánto se revisa. Con la tolerancia en 5 minutos, mirar cada minuto
 *  deja el cierre como mucho un minuto tarde — y como se cierra con la hora
 *  del ÚLTIMO LATIDO, ese retraso no añade tiempo al fichaje. */
const CADA_MS = 60_000;

let temporizador: NodeJS.Timeout | null = null;

/** Cierra los fichajes cuya pestaña dejó de dar señales de vida.
 *
 *  El intervalo se cierra con la hora del último latido, NO con la de ahora:
 *  si te fuiste a las 18:05 y el servidor se entera a las 18:10, quedan
 *  imputadas las 18:05. Es toda la razón de ser del latido. */
export function cerrarFichajesSinLatido(): void {
  const ahora = new Date().toISOString();
  // Solo el ÚLTIMO intervalo de cada operario puede estar abierto, así que
  // esto da como mucho una entrada por persona.
  const operarios = new Set(
    leerTodosIntervalos()
      .filter((iv) => iv.fin === null)
      .map((iv) => iv.operarioId),
  );
  for (const operarioId of operarios) {
    const f = leerFichaje(operarioId);
    const ab = abierto(f);
    if (!ab) continue;
    const cerrado = cerrarPorInactividad(
      f,
      leerUltimoLatido(operarioId),
      ahora,
      TOLERANCIA_LATIDO_MS,
    );
    if (!cerrado) continue;

    guardarFichaje(operarioId, cerrado);
    // Mismo camino que cualquier otro cierre (ver POST /api/fichaje): sus
    // bonos y movimientos de fase se encolan hacia OLANET igual que si
    // alguien hubiera pulsado pausar.
    encolarFichaje(operarioId, cerrado.intervalos);
    const finReal = cerrado.intervalos[cerrado.intervalos.length - 1].fin;
    // Sin este aviso, mañana ves menos tiempo del que esperabas y no sabes
    // por qué.
    if (finReal) registrarAvisoCierre(operarioId, ab.ofIds, finReal);
  }
}

/** Arranca la revisión periódica. Idempotente: llamarla dos veces no duplica
 *  el temporizador. */
export function arrancarCierrePorInactividad(): void {
  if (temporizador) return;
  temporizador = setInterval(() => {
    try {
      cerrarFichajesSinLatido();
    } catch (e) {
      // Nunca se propaga: es un temporizador, y un fallo no puede tumbar el
      // proceso. La vuelta siguiente lo reintenta.
      console.error("[fichaje] el cierre por inactividad falló:", e);
    }
  }, CADA_MS);
  // No mantiene vivo el proceso por sí solo: si Next se cierra, se cierra.
  temporizador.unref?.();
}

export function pararCierrePorInactividad(): void {
  if (!temporizador) return;
  clearInterval(temporizador);
  temporizador = null;
}
