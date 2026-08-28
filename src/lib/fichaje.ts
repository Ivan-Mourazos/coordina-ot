import type { OF, Rol } from "./types";

// ─── Motor de fichaje por intervalos ─────────────────────────────────────────
// Funciones puras. Regla clave: cambiar el conjunto de OFs de un fichaje que
// corre = cerrar el intervalo y abrir otro; la historia nunca se recalcula.
// Los minutos por OF se DERIVAN de los intervalos (nunca se guardan sumados):
// Olanet funciona por tramos horarios, así conservamos la información completa.

export interface Intervalo {
  inicio: string; // ISO
  fin: string | null; // null = corriendo ahora
  ofIds: string[]; // OFs que comparten el tramo (reparto a partes iguales)
  rol: Rol;
  operarioId: string; // solo uso interno de la web (RPS no recibe nombres)
}

export interface Fichaje {
  intervalos: Intervalo[];
}

export const FICHAJE_VACIO: Fichaje = { intervalos: [] };

/** Valida el fichaje leído de localStorage antes de confiar en su forma: es
 *  dato de usuario (puede venir corrupto, vacío o de una versión anterior del
 *  esquema). Cualquier desviación de la forma esperada → FICHAJE_VACIO, nunca
 *  se propaga un objeto a medio validar. */
export function parseFichaje(raw: string | null): Fichaje {
  if (!raw) return FICHAJE_VACIO;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return FICHAJE_VACIO;
  }
  const intervalos = (parsed as { intervalos?: unknown } | null)?.intervalos;
  if (!Array.isArray(intervalos)) return FICHAJE_VACIO;
  const formaValida = intervalos.every((iv) => {
    const i = iv as Partial<Intervalo> | null;
    return (
      !!i &&
      typeof i.inicio === "string" &&
      (i.fin === null || typeof i.fin === "string") &&
      Array.isArray(i.ofIds) &&
      (i.rol === "plantear" || i.rol === "revisar") &&
      typeof i.operarioId === "string"
    );
  });
  return formaValida ? (parsed as Fichaje) : FICHAJE_VACIO;
}

export function abierto(f: Fichaje): Intervalo | null {
  const ultimo = f.intervalos[f.intervalos.length - 1];
  return ultimo && ultimo.fin === null ? ultimo : null;
}

function cerrar(f: Fichaje, ahora: string): Fichaje {
  const ab = abierto(f);
  if (!ab) return f;
  return {
    intervalos: [...f.intervalos.slice(0, -1), { ...ab, fin: ahora }],
  };
}

/** Deja corriendo exactamente `ofIds` (deduplicadas). Lista vacía = pausar. */
export function fichar(
  f: Fichaje,
  ofIds: string[],
  rol: Rol,
  operarioId: string,
  ahora: string,
): Fichaje {
  const ids = [...new Set(ofIds)];
  const ab = abierto(f);
  if (
    ab &&
    ab.rol === rol &&
    ab.operarioId === operarioId &&
    ids.length === ab.ofIds.length &&
    ids.every((id) => ab.ofIds.includes(id))
  ) {
    return f; // idempotente
  }
  const cerrado = cerrar(f, ahora);
  if (ids.length === 0) return cerrado;
  return {
    intervalos: [...cerrado.intervalos, { inicio: ahora, fin: null, ofIds: ids, rol, operarioId }],
  };
}

export function pausar(f: Fichaje, ahora: string): Fichaje {
  return cerrar(f, ahora);
}

/** Tolerancia por defecto del latido: sin avisos del cliente durante más de
 *  esto, se asume que la pestaña se cerró (portátil apagado, navegador
 *  cerrado) y no que la persona sigue delante en silencio.
 *
 *  QUINCE minutos y no cinco. Este número NO decide cuánto tiempo se apunta:
 *  el cierre se hace siempre a la hora del ÚLTIMO LATIDO (ver
 *  `cerrarPorInactividad`), así que alargarlo no imputa ni un minuto de más —
 *  solo se tarda más en darse cuenta, y lo único que se nota es que el punto
 *  verde de quien cerró el portátil tarda más en apagarse para los demás.
 *
 *  Lo que se gana a cambio es el caso normal: trabajar con el navegador
 *  minimizado o en otra pestaña. Ahí los navegadores frenan los temporizadores
 *  de la página —Chrome los deja en uno por minuto— y algunos llegan a congelar
 *  la pestaña un rato (Edge la "duerme" por su cuenta). Con cinco minutos, un
 *  frenazo de esos cortaba un fichaje que estaba perfectamente vivo. */
export const TOLERANCIA_LATIDO_MS = 15 * 60_000;

/** Cierra el intervalo abierto de un fichaje cuya pestaña dejó de avisar
 *  ("latido") hace más de `toleranciaMs`. Lo cierra EN LA HORA DEL ÚLTIMO
 *  LATIDO, nunca en `ahora`: si alguien se fue a las 18:05 y el chequeo
 *  periódico no corre hasta las 18:10 (o hasta las 9:00 del día siguiente si
 *  el servidor estuvo parado), el fichaje debe quedar cerrado a las 18:05,
 *  la hora real en que la pestaña dejó de estar viva — no la hora en que el
 *  servidor se dio cuenta.
 *
 *  Deliberadamente mide si la PESTAÑA sigue viva, no si la persona está
 *  delante del teclado: en Oficina Técnica buena parte del trabajo ocurre
 *  lejos del teclado (medir una pieza, mirar el parte en papel, hablar con
 *  Producción), así que detectar inactividad de ratón/teclado cortaría
 *  trabajo real. Que una ausencia corta del puesto siga fichando es un
 *  efecto ACEPTADO A PROPÓSITO de este diseño, no un descuido: lo único que
 *  se corta es el olvido de cerrar la pestaña (o pausar), nunca las pausas
 *  cortas de trabajo real. No "arreglar" esto añadiendo detección de
 *  inactividad de ratón: fue descartado a propósito.
 *
 *  Devuelve `null` si no hay nada que cerrar: sin intervalo abierto, o el
 *  latido (o la falta de él, ver abajo) es reciente. */
export function cerrarPorInactividad(
  f: Fichaje,
  ultimoLatido: string | null,
  ahora: string,
  toleranciaMs: number,
): Fichaje | null {
  const ab = abierto(f);
  if (!ab) return null;

  // Sin latido registrado: puede pasar con un intervalo abierto ANTES de que
  // existiera esta función (nadie llamó nunca a registrarLatido para él) o
  // con la tabla de latidos corrupta/vaciada. Se trata como si el latido
  // hubiera llegado justo al abrir el intervalo (guardarFichaje SIEMPRE
  // registra latido al abrir, así que en el caso normal esto no debería
  // ocurrir): si el intervalo lleva abierto más de la tolerancia sin ningún
  // latido, se cierra con su propio inicio; si es reciente, se deja correr
  // con normalidad. La alternativa —no cerrar nunca sin latido— dejaría sin
  // red de seguridad justo el caso que motivó esto (el fichaje de 11h de la
  // simulación no tenía latido previo, porque la función no existía).
  const referencia = ultimoLatido ?? ab.inicio;

  if (Date.parse(ahora) - Date.parse(referencia) < toleranciaMs) return null;

  // El cierre nunca puede quedar antes del inicio del intervalo: un latido
  // corrupto o un reloj desincronizado no puede producir un fichaje de
  // duración negativa.
  const fin = Date.parse(referencia) < Date.parse(ab.inicio) ? ab.inicio : referencia;

  return {
    intervalos: [...f.intervalos.slice(0, -1), { ...ab, fin }],
  };
}

/** Minutos atribuidos a una OF: Σ (fin−inicio)/nºOFs de sus tramos. */
export function minutosOF(
  f: Fichaje,
  ofId: string,
  opts: { rol?: Rol; ahora?: string } = {},
): number {
  let total = 0;
  for (const iv of f.intervalos) {
    if (!iv.ofIds.includes(ofId)) continue;
    if (opts.rol && iv.rol !== opts.rol) continue;
    const fin = iv.fin ?? opts.ahora;
    if (!fin) continue; // abierto y sin `ahora`: no se cuenta
    total += (Date.parse(fin) - Date.parse(iv.inicio)) / 60000 / iv.ofIds.length;
  }
  return total;
}

export interface TiemposRolOF {
  planteoMin: number;
  revisionMin: number;
  /** Minutos de CADA operario en cada rol, por su id.
   *
   *  Era solo la lista de quiénes, y con eso el historial podía decir "lo
   *  plantearon Adrián e Iván — 45m" pero no cuánto puso cada uno. El dato
   *  estaba en los intervalos y se perdía al agregar. Quiénes son sigue
   *  saliendo de aquí: son las claves. */
  operarios: { plantear: Record<string, number>; revisar: Record<string, number> };
}

/** Reparte TODOS los intervalos por OF y rol de una pasada.
 *
 *  Es el mismo cálculo que `minutosOF`, pero devolviendo el desglose completo:
 *  RPS no distingue planteo de revisión (no existe tarea de revisión en la ruta
 *  de OT), así que esta es la ÚNICA fuente de esa separación. El historial la
 *  necesita para no colapsar los dos roles en un solo número al pasar el pedido
 *  a Producción. */
export function agregarPorRol(
  f: Fichaje,
  opts: { ahora?: string } = {},
): Map<string, TiemposRolOF> {
  const porOF = new Map<string, TiemposRolOF>();
  for (const iv of f.intervalos) {
    const fin = iv.fin ?? opts.ahora;
    if (!fin || iv.ofIds.length === 0) continue; // abierto y sin `ahora`: no cuenta
    const minutos = (Date.parse(fin) - Date.parse(iv.inicio)) / 60000 / iv.ofIds.length;
    for (const ofId of iv.ofIds) {
      let e = porOF.get(ofId);
      if (!e) {
        e = { planteoMin: 0, revisionMin: 0, operarios: { plantear: {}, revisar: {} } };
        porOF.set(ofId, e);
      }
      if (iv.rol === "plantear") e.planteoMin += minutos;
      else e.revisionMin += minutos;
      const quienes = e.operarios[iv.rol];
      quienes[iv.operarioId] = (quienes[iv.operarioId] ?? 0) + minutos;
    }
  }
  return porOF;
}

/** Minutos que cada persona ha echado EN ESTA OF desde la web, por rol.
 *
 *  Es el mismo reparto que `minutosOF`, pero sin colapsar quién. Hace falta
 *  porque el detalle de la OF enseña el tiempo persona a persona —RPS ya lo
 *  hace con sus imputaciones— y con el total agregado había que atribuírselo a
 *  alguien a mano, que es inventarse el dato: en una OF que empieza uno y
 *  termina otro, o donde el revisor echa media hora, el total bajo un solo
 *  nombre miente.
 *
 *  Ordenado de más minutos a menos, igual que `imputaciones`. */
export function minutosPorOperarioOF(
  f: Fichaje,
  ofId: string,
  opts: { ahora?: string } = {},
): { operarioId: string; planteoMin: number; revisionMin: number }[] {
  const porOp = new Map<string, { operarioId: string; planteoMin: number; revisionMin: number }>();
  for (const iv of f.intervalos) {
    if (!iv.ofIds.includes(ofId)) continue;
    const fin = iv.fin ?? opts.ahora;
    if (!fin || iv.ofIds.length === 0) continue; // abierto y sin `ahora`: no cuenta
    const minutos = (Date.parse(fin) - Date.parse(iv.inicio)) / 60000 / iv.ofIds.length;
    let e = porOp.get(iv.operarioId);
    if (!e) {
      e = { operarioId: iv.operarioId, planteoMin: 0, revisionMin: 0 };
      porOp.set(iv.operarioId, e);
    }
    if (iv.rol === "plantear") e.planteoMin += minutos;
    else e.revisionMin += minutos;
  }
  return [...porOp.values()].sort(
    (a, b) => b.planteoMin + b.revisionMin - (a.planteoMin + a.revisionMin),
  );
}

/** Rol con el que se ficharía esta OF según su estado: en revisión (o lista
 *  para revisar) se ficha como revisor; en cualquier otro caso, como autor. */
export function rolFichajeDe(of: OF): Rol {
  return of.estado === "por_revisar" || of.estado === "en_revision" ? "revisar" : "plantear";
}

/** ¿Se puede fichar en esta OF? Excluye detenidas, anuladas y las
 *  que RPS marca como no imputables (fichable === false): ese tiempo no
 *  subiría a RPS. `fichable` ausente (mock) no restringe.
 *
 *  Las APROBADAS sí se fichan: cerrar el planteo no cierra el trabajo, y hay
 *  que poder apuntar el rato de un último retoque sin reabrir la OF. */
export function esFichable(of: OF): boolean {
  return !of.detenida && of.fichable !== false && of.estado !== "anulada";
}

/** Motivo legible por el que una OF no se puede fichar (null = sí se puede). */
export function motivoNoFichable(of: OF): string | null {
  if (of.detenida) return "Detenida por Producción";
  if (of.fichable === false)
    return "La situación en RPS no admite fichar (el tiempo no subiría)";
  if (of.estado === "anulada") return "OF anulada";
  return null;
}

/** OFs en las que se puede fichar. Acepta un `Pedido` o cualquier objeto con
 *  forma equivalente (p. ej. `ConOFs` del tablero): la regla es la misma,
 *  única implementación reutilizada por lib/accion-pedido.ts. */
export function ofsFichables(p: { ofs: OF[] }): OF[] {
  return p.ofs.filter(esFichable);
}
