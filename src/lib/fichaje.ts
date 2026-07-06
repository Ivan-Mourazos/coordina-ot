import type { OF, Pedido, Rol } from "./types";

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

/** Rol con el que se ficharía esta OF según su estado: en revisión (o lista
 *  para revisar) se ficha como revisor; en cualquier otro caso, como autor. */
export function rolFichajeDe(of: OF): Rol {
  return of.estado === "por_revisar" || of.estado === "en_revision" ? "revisar" : "plantear";
}

/** ¿Se puede fichar en esta OF? Excluye detenidas, anuladas, aprobadas y las
 *  que RPS marca como no imputables (fichable === false): ese tiempo no
 *  subiría a RPS. `fichable` ausente (mock) no restringe. */
export function esFichable(of: OF): boolean {
  return (
    !of.detenida &&
    of.fichable !== false &&
    of.estado !== "anulada" &&
    of.estado !== "aprobada"
  );
}

/** Motivo legible por el que una OF no se puede fichar (null = sí se puede). */
export function motivoNoFichable(of: OF): string | null {
  if (of.detenida) return "Detenida por Producción";
  if (of.fichable === false)
    return "La situación en RPS no admite fichar (el tiempo no subiría)";
  if (of.estado === "anulada") return "OF anulada";
  if (of.estado === "aprobada") return "OF aprobada: ya está lista para Producción";
  return null;
}

/** OFs de un pedido en las que se puede fichar. */
export function ofsFichables(p: Pedido): OF[] {
  return p.ofs.filter(esFichable);
}
