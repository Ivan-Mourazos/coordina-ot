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
  if (ab && ab.rol === rol && ids.length === ab.ofIds.length && ids.every((id) => ab.ofIds.includes(id))) {
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

/** OFs de un pedido en las que se puede fichar. */
export function ofsFichables(p: Pedido): OF[] {
  return p.ofs.filter(
    (of) => !of.detenida && of.estado !== "anulada" && of.estado !== "aprobada",
  );
}
