import { ESTADO_FASE, type EstadoFase } from "../fases";
import { situacionDe } from "../fase-pendiente";

// ─── Cerrar UNA fase en RPS: las REGLAS, sin la conexión ─────────────────────
// Esto es lo que decide si el 3 se escribe o no, y es lo único que se comparte
// entre `POST /api/fases` (arrastre de fases sueltas) y `POST
// /api/fases/cerrar-of` (spec 2026-09-15, sección 2 "Lo que se comparte con
// /api/fases"). Escribe en el sistema de la fábrica, así que es la pieza que
// más falta hace probar.
//
// VIVE APARTE DE `olanet.ts` A PROPÓSITO. Cuando estaba dentro, llamaba a sus
// vecinos (`maquinaDeFase`, `buscarIdBoletin`, `estadoDeFase`, `moverFase`) por
// referencia directa dentro del mismo fichero, y esas llamadas no hay forma de
// sustituirlas desde fuera: mockear "@/lib/server/olanet" cambia el módulo
// entero, no lo que ese módulo se llama a sí mismo. El resultado era que los
// tests de la ruta tenían que REPETIR este cuerpo dentro del mock para poder
// probar algo, así que lo que quedaba probado era la copia, no esto. Con las
// cuatro consultas entrando por parámetro se prueba la función de verdad, y
// aquí no se importa `mssql`: este fichero no sabe abrir ninguna conexión.

export type ResultadoFinalizarFase =
  | { ok: true; yaEstaba: boolean; idBoletin: string }
  | { ok: false; status: 403 | 404 | 409; error: string };

/** Lo que esta orquestación necesita saber de OLANET. Las cuatro las cumple
 *  `server/olanet.ts` con sus consultas de verdad; en los tests son otras
 *  cuatro funciones y no se abre ninguna conexión. */
export interface FasesEnOlanet {
  /** El centro de trabajo de esa fase, o null si el boletín ya no existe. */
  maquinaDeFase: (idBoletin: string) => Promise<string | null>;
  /** El boletín de (OF, fase), para cuando el que trajo la ficha se quedó
   *  viejo. */
  buscarIdBoletin: (of: string, fase: string) => Promise<string | null>;
  /** `IdEstadoOF` ahora mismo, o null si la fase no está. */
  estadoDeFase: (idBoletin: string) => Promise<number | null>;
  /** Mueve la fase de estado y deja el movimiento en el histórico. */
  moverFase: (opts: {
    idBoletin: string;
    estado: EstadoFase;
    operarioRps: string;
    cuando: Date;
  }) => Promise<void>;
}

export interface OpcionesFinalizarFase {
  idBoletin: string;
  /** Para rebuscar el boletín si se quedó viejo (caso AR.25.02771, ver el
   *  comentario de `POST /api/fases`). Sin ellos, un boletín viejo es 404
   *  directo. */
  of?: string | null;
  fase?: string | null;
  /** ¿Esta fase se puede cerrar desde aquí? El arrastre acepta cualquiera de
   *  las dos secciones (`esFaseDeLaWeb`); cerrar una OF suelta, solo las de
   *  SU sección (`(m) => esFaseDe(m, seccion)`), para no cerrar de rebote una
   *  fase de la otra sección. */
  esNuestra: (maquina: string) => boolean;
  operarioRps: string;
  cuando: Date;
}

/** Cerrar UNA fase en RPS: releer máquina y estado (el boletín que trajo la
 *  ficha puede haberse quedado viejo), rebuscar por (OF, fase) si hace falta,
 *  comprobar que es nuestra y que se puede finalizar, y mover a 3 con la fecha
 *  de hoy.
 *
 *  EL ORDEN DE LAS COMPROBACIONES IMPORTA y por eso está probado: primero de
 *  QUIÉN es la fase y después en qué estado está. Al revés, una fase del taller
 *  que estuviera en un estado raro se rechazaría por el estado, y el día que
 *  ese estado fuera de los que sí admiten cierre se escribiría en trabajo que
 *  no es nuestro.
 *
 *  NO mira `modoFichaje()`: en sombra/ensayo no se debe llegar a llamarla, y
 *  esa decisión la toma cada ruta ANTES de entrar aquí (ver el comentario en
 *  `POST /api/fases`) — mezclarlo aquí obligaría a las dos rutas a tratar el
 *  "no se escribe por el modo" como si fuera un fallo de OLANET, cuando para
 *  cerrar una OF suelta NO lo es (ahí se guarda la marca igual, con el modo). */
export async function finalizarFaseCon(
  olanet: FasesEnOlanet,
  opts: OpcionesFinalizarFase,
): Promise<ResultadoFinalizarFase> {
  let boletin = opts.idBoletin;
  let maquina = await olanet.maquinaDeFase(boletin);

  if (maquina === null && opts.of && opts.fase) {
    const rebuscado = await olanet.buscarIdBoletin(opts.of, opts.fase);
    if (rebuscado) {
      boletin = rebuscado;
      maquina = await olanet.maquinaDeFase(boletin);
    }
  }
  if (maquina === null)
    return { ok: false, status: 404, error: "Esa fase ya no existe en OLANET" };
  if (!opts.esNuestra(maquina))
    return { ok: false, status: 403, error: `Esa fase es de ${maquina}, que no es trabajo de oficina` };

  const estado = await olanet.estadoDeFase(boletin);
  if (estado === ESTADO_FASE.finalizada) return { ok: true, yaEstaba: true, idBoletin: boletin };
  if (situacionDe(estado ?? -1) !== "sin_finalizar")
    return { ok: false, status: 409, error: "Esa fase no se puede finalizar desde aquí" };

  await olanet.moverFase({ idBoletin: boletin, estado: ESTADO_FASE.finalizada, operarioRps: opts.operarioRps, cuando: opts.cuando });
  return { ok: true, yaEstaba: false, idBoletin: boletin };
}
