import { MAQUINA_OT, TRASPASADO_NO_PROCESAR, partirOfId } from "../bonos";
import { ESTADO_FASE } from "../fases";
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
  estadoDeFase,
  insertarBono,
  moverFase,
  sincronizarFichajeEnCurso,
  type FilaEnCurso,
} from "./olanet";
import { COD_RPS_POR_OPERARIO, MAQUINA_POR_OPERARIO } from "./operarios";
import { maquinasDeTareas } from "./estado-db";

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
  // Si es un movimiento de FINALIZACIÓN y la fase YA está en 3, se da por
  // enviado sin escribir: evita un segundo apunte en sch_FasesMov al volver a
  // pasar un pedido recuperado (Tarea 8), y de paso arregla lo que ya pasaba
  // con los pedidos que RPS reabre solo con una OF nueva (Confirmado con
  // Iván, punto 2). Cuesta una consulta por evento de fase.
  if (p.datos.estado === ESTADO_FASE.finalizada) {
    const estadoActual = await estadoDeFase(idBoletin);
    if (estadoActual === ESTADO_FASE.finalizada) return true;
  }
  await moverFase({
    idBoletin,
    estado: p.datos.estado,
    operarioRps,
    cuando: new Date(p.datos.cuando),
  });
  return true;
}

async function drenarColaUnaVez(): Promise<number> {
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

/** Una pasada en curso a la vez. `drenarCola` no tenía candado propio:
 *  `corriendo` (más abajo) protege solo la `vuelta()` periódica, no la
 *  función en sí. Si `POST /api/fases/cerrar-of` la llama mientras el
 *  temporizador de 60 s está a mitad de otra pasada, sin candado un mismo
 *  evento podía salir dos veces.
 *
 *  Quien llega con otra pasada en curso ESPERA a que termine y hace SU
 *  PROPIA pasada — no se conforma con el resultado ajeno ni la salta: cerrar
 *  una OF necesita la garantía de que SUS eventos, encolados después de que
 *  la pasada en curso empezara a leer la cola, también salieron. */
let colaEnCurso: Promise<number> | null = null;

/** Vacía la cola en orden. Devuelve cuántos eventos se escribieron. */
export async function drenarCola(): Promise<number> {
  if (colaEnCurso) {
    await colaEnCurso.catch(() => {}); // nunca lanza (ver el try/catch de arriba), pero por si acaso
    return drenarCola();
  }
  const p = drenarColaUnaVez();
  colaEnCurso = p;
  try {
    return await p;
  } finally {
    colaEnCurso = null;
  }
}

/** Filas de "fichando ahora" a partir de los intervalos abiertos. */
export function filasEnCurso(ahora = new Date().toISOString()): FilaEnCurso[] {
  const abiertos = leerTodosIntervalos().filter((iv) => iv.fin === null);
  if (abiertos.length === 0) return [];

  const porOF = agregarPorRol({ intervalos: abiertos }, { ahora });
  // La máquina de cada tarea, igual que al escribir su bono: esta tabla dice
  // "quién está fichando qué ahora mismo", y con la máquina de la persona una
  // tarea de corte figuraba como hecha en la mesa de diseño.
  const porTarea = maquinasDeTareas([...new Set(abiertos.flatMap((iv) => iv.ofIds))]);
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
        maquina: maquinaDeTarea(ofId, iv.operarioId, porTarea),
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
  const porTarea = maquinasDeTareas([...new Set(pendientes.flatMap((iv) => iv.ofIds))]);
  const yaEnRps = new Set<string>();
  for (const maquina of maquinasEnJuego(pendientes, porTarea)) {
    // Un tramo entra en la consulta de una máquina si ALGUNA de sus OF va a
    // esa máquina: con OF repartidas entre dos, sus bonos están en las dos.
    const suyos = pendientes.filter((iv) =>
      iv.ofIds.some((ofId) => maquinaDeTarea(ofId, iv.operarioId, porTarea) === maquina),
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
  const maquinas = maquinasAPublicar(filas, maquinasPublicadas);
  for (const maquina of maquinas) {
    await sincronizarFichajeEnCurso(
      filas.filter((f) => f.maquina === maquina),
      maquina,
    );
  }
  maquinasPublicadas = new Set(filas.map((f) => f.maquina));
}

/** Máquinas en las que la vuelta anterior dejó a alguien fichando. Hacen falta
 *  para BORRAR esa fila cuando para el reloj: sin ellas, una máquina que no es
 *  la de su sección se quedaría enseñando para siempre un fichaje acabado.
 *  En memoria: tras reiniciar se pierde, y una fila que quedara colgada en
 *  una de esas máquinas se limpia la próxima vez que alguien fiche en ella. */
let maquinasPublicadas: ReadonlySet<string> = new Set();

/** Qué máquinas sincronizar en esta vuelta.
 *
 *  NO basta con las de cada sección (A-OTEC, A-DGRA): la fila lleva la máquina
 *  de su TAREA, y una tarea de OT puede ir a OTEC-A. Recorriendo solo las de
 *  sección, esa fila se descartaba en silencio y quien la fichaba no aparecía
 *  como fichando en ninguna parte —ni en la web ni en la herramienta vieja—,
 *  aunque su tiempo sí se guardaba y se mandaba bien al parar.
 *
 *  Y tampoco TODAS las máquinas posibles: la sincronización empieza borrando
 *  las filas de la máquina, y esta tabla la comparte el mini-olanet. Barrer
 *  cada minuto una máquina que usa otra gente (el plóter, OTEC-A desde el
 *  taller) le borraría su fichaje en curso. Así que solo: las de sección, las
 *  que tienen ahora a alguien de la web y las que tenían en la vuelta anterior
 *  (para limpiar al parar). */
export function maquinasAPublicar(
  filas: readonly { maquina: string }[],
  anteriores: ReadonlySet<string>,
): string[] {
  return [...new Set([...TODAS_LAS_MAQUINAS, ...filas.map((f) => f.maquina), ...anteriores])];
}

/** Las máquinas de todas las secciones. Fijas: salen de lib/secciones.ts. */
const TODAS_LAS_MAQUINAS: readonly string[] = [
  ...new Set(Object.values(SECCIONES).map((s) => s.maquina)),
];

/** La máquina con la que se escribió (o se escribirá) el bono de una TAREA.
 *
 *  La de la tarea manda y la de la persona es el respaldo, igual que en
 *  `bonosDe`. Tiene que decidir LO MISMO que allí: aquí se usa para preguntarle
 *  a OLANET qué bonos ya traspasó, y preguntar por una máquina distinta de la
 *  que se escribió deja el tramo sin sellar para siempre — su tiempo se
 *  contaría dos veces, aquí y en RPS. */
function maquinaDeTarea(
  ofId: string,
  operarioId: string,
  porTarea: ReadonlyMap<string, string>,
): string {
  return porTarea.get(ofId) ?? MAQUINA_POR_OPERARIO[operarioId] ?? MAQUINA_OT;
}

/** Las máquinas que tocan estos intervalos, sin repetir.
 *
 *  Por TAREA y no por persona: un mismo tramo puede repartirse entre OF de
 *  máquinas distintas —una de diseño y un corte—, y entonces sus bonos viven
 *  en dos sitios. */
function maquinasEnJuego(
  intervalos: readonly { operarioId: string; ofIds: string[] }[],
  porTarea: ReadonlyMap<string, string>,
): string[] {
  return [
    ...new Set(
      intervalos.flatMap((iv) =>
        iv.ofIds.map((ofId) => maquinaDeTarea(ofId, iv.operarioId, porTarea)),
      ),
    ),
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
