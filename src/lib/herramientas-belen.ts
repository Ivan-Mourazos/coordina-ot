import { ordenarPorIds } from "./orden-guardado";
import { LISTAS_BELEN, type IdLista } from "./vista-belen-listas";

export const HERRAMIENTAS_BELEN = [
  { id: "entregas", label: "Pedidos por fecha solicitada", explica: "Las OF por acabar: lo atrasado, lo de hoy, mañana y la semana, por la fecha que pidió el cliente." },
  ...LISTAS_BELEN,
];

export type IdHerramienta = "entregas" | IdLista;

/** Recupera preferencias antiguas y añade al final las herramientas nuevas. */
export function ordenarHerramientas(guardado: unknown): typeof HERRAMIENTAS_BELEN {
  return ordenarPorIds(HERRAMIENTAS_BELEN, guardado);
}

// ─── Grupos ──────────────────────────────────────────────────────────────────
// Iván, 12/11/2026: con catorce herramientas la portada y la barra de listas
// eran un batiburrillo («hay que ordenar esto todo»). Van por tema; dentro de
// cada grupo, en el que elija Belén arrastrando. En la portada, desde el
// 16/11/2026, también los grupos (ordenarGrupos); la columna de listas sigue
// con este orden.

export type IdGrupo = "fechas" | "pedidos" | "bultos" | "tiempos" | "material" | "datos";

export const GRUPOS_BELEN: ReadonlyArray<{ id: IdGrupo; label: string }> = [
  { id: "fechas", label: "Fechas" },
  { id: "pedidos", label: "Pedidos" },
  { id: "bultos", label: "Bultos y unidades" },
  { id: "tiempos", label: "Tiempos" },
  { id: "material", label: "Material y compras" },
  { id: "datos", label: "Datos de la OF" },
];

/** El grupo de cada herramienta. Record: una lista nueva no compila sin grupo. */
export const GRUPO_DE: Record<IdHerramienta, IdGrupo> = {
  "entregas": "fechas",
  "fechas-comprometidas": "fechas",
  "delimitacion": "fechas",
  "sin-gestionar": "pedidos",
  "tp-cot": "pedidos",
  "bultos-subidos": "bultos",
  "finalizadas-bultos": "bultos",
  "desfase": "bultos",
  "sin-tiempos": "tiempos",
  "tareas-horas": "tiempos",
  "tiempos-sin-subir": "tiempos",
  "incidencias": "tiempos",
  "tiempos-abiertos": "tiempos",
  "compras-pendientes": "material",
  "detenidas-material": "material",
  "varias-maquinas": "datos",
  "sin-descripcion": "datos",
};

export const grupoDe = (id: string): IdGrupo => GRUPO_DE[id as IdHerramienta] ?? "datos";

/** Los grupos en el orden guardado por la persona (Iván, 16/11/2026: Belén
 *  ordena también los bloques de la portada). Los nuevos van al final. */
export function ordenarGrupos(guardado: unknown): Array<(typeof GRUPOS_BELEN)[number]> {
  return ordenarPorIds(GRUPOS_BELEN, guardado);
}

/** Reparte lo que llega (ya en el orden de la persona) en los grupos, en el
 *  orden de `grupos` (por defecto, el de siempre). Los grupos sin nada no salen. */
export function enGrupos<T extends { id: string }>(
  items: readonly T[],
  grupos: ReadonlyArray<{ id: IdGrupo; label: string }> = GRUPOS_BELEN,
): Array<{ id: IdGrupo; label: string; items: T[] }> {
  return grupos.map((g) => ({ ...g, items: items.filter((x) => grupoDe(x.id) === g.id) })).filter((g) => g.items.length > 0);
}

/** La posición (en la lista entera) de la vecina del mismo grupo hacia
 *  `paso` (-1 antes, +1 después), o -1 si no hay. Para mover con el teclado
 *  sin saltar a otro grupo. */
export function vecinaDelGrupo<T extends { id: string }>(items: readonly T[], id: string, paso: -1 | 1): number {
  const g = grupoDe(id);
  for (let i = items.findIndex((x) => x.id === id) + paso; i >= 0 && i < items.length; i += paso) {
    if (grupoDe(items[i].id) === g) return i;
  }
  return -1;
}
