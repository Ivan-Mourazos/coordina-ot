import { MAQUINA_OT, TRASPASADO_NO_PROCESAR, partirOfId } from "../bonos";
import { agregarPorRol } from "../fichaje";
import { leerTodosIntervalos } from "./fichaje-db";
import {
  descartar,
  leerPendientes,
  marcarEnviados,
  marcarError,
  modoFichaje,
  type Pendiente,
} from "./olanet-outbox";
import {
  buscarIdBoletin,
  insertarBono,
  moverFase,
  sincronizarFichajeEnCurso,
  type FilaEnCurso,
} from "./olanet";
import { COD_RPS_POR_OPERARIO } from "./operarios";

// ─── Sincronización con OLANET ───────────────────────────────────────────────
// Dos trabajos periódicos, los dos parados mientras el modo sea "sombra":
//
//  · Vaciar la cola de salida (líneas de tiempo y movimientos de fase). EN
//    ORDEN y de uno en uno: el tiempo tiene que estar puesto antes de que la
//    fase cambie de estado, así que al primer fallo se para y se reintenta en
//    la vuelta siguiente. Adelantar eventos rompería esa garantía.
//
//  · Refrescar la foto de quién ficha ahora. Esto NO va por la cola: es estado
//    presente, no histórico. Si una vuelta falla, la siguiente lo deja bien; no
//    tiene sentido acumular fotos viejas para reenviarlas.

/** Cada cuánto se sincroniza. El límite no es el coste sino la resolución del
 *  dato: `tgm_fichajes_olanet_ot.tiempo` son minutos enteros, así que ir más
 *  rápido no cambia nada de lo que ve Producción. */
const CADA_MS = 60_000;

/** Tras estos intentos el evento se descarta con su motivo en vez de seguir
 *  bloqueando la cola. */
const MAX_INTENTOS = 5;

/** Cuántos eventos se procesan por vuelta. Con 60 s entre vueltas sobra para
 *  el ritmo real de OT, y acota lo que puede tardar una sola pasada. */
const LOTE = 200;

let corriendo = false;
let temporizador: NodeJS.Timeout | null = null;

/** Escribe un evento en OLANET. Devuelve `false` si no se pudo y se ha
 *  descartado: el llamante no debe marcarlo como enviado, porque `descartar`
 *  ya lo saca de la cola CONSERVANDO el motivo, y `marcarEnviados` lo borraría. */
async function enviarUno(p: Pendiente): Promise<boolean> {
  const ensayo = modoFichaje() === "ensayo";

  if (p.tipo === "bono") {
    // En ensayo el bono se escribe igual pero marcado como no procesable, así
    // que recorre todo el camino real sin que el tiempo llegue a RPS.
    const traspasado = ensayo ? TRASPASADO_NO_PROCESAR : p.datos.traspasado;
    await insertarBono({ ...p.datos, traspasado });
    return true;
  }

  // Los movimientos de fase NO son neutralizables: poner IdEstadoOF = 3 deja la
  // fase finalizada para Producción, en una OF real de un cliente real. Mientras
  // el mini-olanet siga en uso, un ensayo no puede permitirse eso, así que se
  // descartan dejando constancia en la cola.
  if (ensayo) {
    descartar(p.id, `ensayo: no se mueve la fase ${p.datos.of}/${p.datos.numope} a ${p.datos.estado}`);
    return false;
  }

  const operarioRps = COD_RPS_POR_OPERARIO[p.datos.operarioId];
  if (!operarioRps) {
    // No se arregla solo: sin código no se puede escribir a nombre de nadie.
    descartar(p.id, `el operario "${p.datos.operarioId}" no tiene código en RPS`);
    return false;
  }
  const idBoletin = await buscarIdBoletin(p.datos.of, p.datos.numope);
  if (idBoletin === null) {
    // OLANET no tiene esa fase cargada. No debería pasar en OFs fichables, y
    // reintentarlo eternamente bloquearía todo lo que va detrás.
    descartar(p.id, `OLANET no tiene la fase ${p.datos.of}/${p.datos.numope}`);
    return false;
  }
  await moverFase({
    idBoletin,
    estado: p.datos.estado,
    operarioRps,
    cuando: new Date(p.datos.cuando),
  });
  return true;
}

/** Vacía la cola en orden. Devuelve cuántos eventos se escribieron. */
export async function drenarCola(): Promise<number> {
  if (modoFichaje() === "sombra") return 0;

  const pendientes = leerPendientes(LOTE);
  const enviados: number[] = [];
  for (const p of pendientes) {
    try {
      if (await enviarUno(p)) enviados.push(p.id);
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      marcarError(p.id, mensaje);
      if (p.intentos + 1 >= MAX_INTENTOS) {
        descartar(p.id, `${MAX_INTENTOS} intentos fallidos — ${mensaje}`);
        continue; // se descarta y se sigue: ya no bloquea
      }
      console.error(`[olanet] evento ${p.id} falló, se reintenta:`, mensaje);
      break; // el orden importa: no se adelantan los de detrás
    }
  }
  marcarEnviados(enviados);
  return enviados.length;
}

/** Filas de "fichando ahora" a partir de los intervalos abiertos. */
export function filasEnCurso(ahora = new Date().toISOString()): FilaEnCurso[] {
  const abiertos = leerTodosIntervalos().filter((iv) => iv.fin === null);
  if (abiertos.length === 0) return [];

  const porOF = agregarPorRol({ intervalos: abiertos }, { ahora });
  const filas: FilaEnCurso[] = [];
  for (const iv of abiertos) {
    const operarioRps = COD_RPS_POR_OPERARIO[iv.operarioId];
    if (!operarioRps) continue;
    for (const ofId of iv.ofIds) {
      const partes = partirOfId(ofId);
      const t = porOF.get(ofId);
      if (!partes || !t) continue;
      const fase = Number(partes.numope);
      if (!Number.isFinite(fase)) continue; // la columna `fase` es int
      filas.push({
        of: partes.of,
        fase,
        minutos: t.planteoMin + t.revisionMin,
        operarioRps,
      });
    }
  }
  return filas;
}

export async function refrescarEnCurso(): Promise<void> {
  // Solo en activo. Esta tabla la comparte el mini-olanet, y la sincronización
  // empieza borrando las filas de A-OTEC: durante un ensayo se llevaría por
  // delante a quien esté fichando ahora mismo en el sistema de verdad.
  if (modoFichaje() !== "activo") return;
  await sincronizarFichajeEnCurso(filasEnCurso(), MAQUINA_OT);
}

async function vuelta(): Promise<void> {
  if (corriendo) return; // una vuelta lenta no debe solaparse con la siguiente
  corriendo = true;
  try {
    await drenarCola();
    await refrescarEnCurso();
  } catch (e) {
    // Nunca se propaga: es un temporizador, y un fallo de red no puede tumbar
    // el proceso. Lo pendiente sigue en la cola para la vuelta siguiente.
    console.error("[olanet] la sincronización falló:", e);
  } finally {
    corriendo = false;
  }
}

/** Arranca la sincronización periódica. Idempotente: llamarla dos veces no
 *  duplica el temporizador. */
export function arrancarSincronizacion(): void {
  if (temporizador) return;
  temporizador = setInterval(() => void vuelta(), CADA_MS);
  // No mantiene vivo el proceso por sí solo: si Next se cierra, se cierra.
  temporizador.unref?.();
}

export function pararSincronizacion(): void {
  if (!temporizador) return;
  clearInterval(temporizador);
  temporizador = null;
}
