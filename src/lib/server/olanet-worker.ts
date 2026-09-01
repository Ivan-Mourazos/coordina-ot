import { MAQUINA_OT, TRASPASADO_NO_PROCESAR, partirOfId } from "../bonos";
import { SECCIONES } from "../secciones";
import { agregarPorRol } from "../fichaje";
import { diasYOperariosDe, intervaloYaEnRps } from "../traspaso-fichaje";
import { leerTodosIntervalos, marcarTraspasados } from "./fichaje-db";
import {
  descartar,
  leerPendientes,
  marcarEnviados,
  marcarError,
  modoFichaje,
  type Pendiente,
} from "./olanet-outbox";
import {
  bonosTraspasados,
  buscarIdBoletin,
  insertarBono,
  moverFase,
  sincronizarFichajeEnCurso,
  type FilaEnCurso,
} from "./olanet";
import { COD_RPS_POR_OPERARIO, MAQUINA_POR_OPERARIO } from "./operarios";

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
        maquina: MAQUINA_POR_OPERARIO[iv.operarioId] ?? MAQUINA_OT,
      });
    }
  }
  return filas;
}

/** Sella los tramos cuyo tiempo ya está en RPS, para que dejen de contarse
 *  desde aquí.
 *
 *  Es lo que impide que el mismo trabajo se cuente dos veces cuando el fichaje
 *  sube de verdad: hasta que OLANET no lo traspasa, el tiempo lo pone
 *  CoordinaOT; desde que lo traspasa, lo pone RPS —y ahí sale además con su
 *  dueño en el desglose de la OF—. Entre una cosa y la otra no hay hueco: el
 *  tramo cuenta por un lado o por el otro, nunca por los dos ni por ninguno.
 *
 *  SOLO en `activo`. En ensayo los bonos se escriben ya con `traspasado = 2`
 *  para que OLANET no los procese, así que darlos por traspasados sería borrar
 *  del panel un tiempo que no ha llegado a RPS ni va a llegar. */
export async function confirmarTraspasos(): Promise<number> {
  if (modoFichaje() !== "activo") return 0;
  const pendientes = leerTodosIntervalos().filter((iv) => iv.fin !== null);
  if (pendientes.length === 0) return 0;

  // Una consulta POR MÁQUINA: los bonos de OT viven en A-OTEC y los de diseño
  // en A-DGRA, y preguntar por una sola dejaría a la otra sección sin sellar
  // nunca — su tiempo se contaría dos veces, aquí y en RPS.
  const yaEnRps = new Set<string>();
  for (const maquina of maquinasEnJuego(pendientes)) {
    const suyos = pendientes.filter(
      (iv) => (MAQUINA_POR_OPERARIO[iv.operarioId] ?? MAQUINA_OT) === maquina,
    );
    const { dias, operarios } = diasYOperariosDe(suyos, COD_RPS_POR_OPERARIO);
    for (const clave of await bonosTraspasados(dias, operarios, maquina)) yaEnRps.add(clave);
  }
  if (yaEnRps.size === 0) return 0;

  const sellar = pendientes
    .filter((iv) => intervaloYaEnRps(iv, COD_RPS_POR_OPERARIO, yaEnRps))
    .map((iv) => ({ operarioId: iv.operarioId, inicio: iv.inicio }));
  return marcarTraspasados(sellar);
}

export async function refrescarEnCurso(): Promise<void> {
  // Solo en activo. Esta tabla la comparte el mini-olanet, y la sincronización
  // empieza borrando las filas de esa máquina: durante un ensayo se llevaría
  // por delante a quien esté fichando ahora mismo en el sistema de verdad.
  if (modoFichaje() !== "activo") return;

  // UNA LLAMADA POR MÁQUINA, con solo las filas de esa máquina. La
  // sincronización borra y reinserta lo de la máquina que se le pasa: mandarlo
  // todo junto con una sola máquina borraría las filas de A-OTEC y volvería a
  // meter dentro las de diseño, atribuyéndole a OT el tiempo de Carrón.
  //
  // Se recorren TODAS las máquinas conocidas y no solo las que tienen a
  // alguien fichando: una sección donde acaban de parar el reloj necesita su
  // borrado, y sin él se quedaría enseñando para siempre un fichaje que ya no
  // corre.
  const filas = filasEnCurso();
  for (const maquina of TODAS_LAS_MAQUINAS) {
    await sincronizarFichajeEnCurso(
      filas.filter((f) => f.maquina === maquina),
      maquina,
    );
  }
}

/** Las máquinas de todas las secciones. Fijas: salen de lib/secciones.ts. */
const TODAS_LAS_MAQUINAS: readonly string[] = [
  ...new Set(Object.values(SECCIONES).map((s) => s.maquina)),
];

/** Las máquinas que tocan estos intervalos, sin repetir. */
function maquinasEnJuego(intervalos: readonly { operarioId: string }[]): string[] {
  return [
    ...new Set(intervalos.map((iv) => MAQUINA_POR_OPERARIO[iv.operarioId] ?? MAQUINA_OT)),
  ];
}

async function vuelta(): Promise<void> {
  if (corriendo) return; // una vuelta lenta no debe solaparse con la siguiente
  corriendo = true;
  try {
    await drenarCola();
    // Después de vaciar la cola: lo que acaba de salir ya puede estar
    // traspasado, y así se sella en la misma vuelta en vez de en la siguiente.
    await confirmarTraspasos();
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
