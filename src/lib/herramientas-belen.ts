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
// eran un batiburrillo («hay que ordenar esto todo»). Van por tema, siempre en
// este orden; dentro de cada grupo, en el que elija Belén arrastrando.

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
  "desfase": "bultos",
  "tiempos-previstos": "tiempos",
  "maquina-a-horas": "tiempos",
  "tiempos-sin-subir": "tiempos",
  "compras-pendientes": "material",
  "detenidas-material": "material",
  "varias-maquinas": "datos",
  "sin-descripcion": "datos",
};

export const grupoDe = (id: string): IdGrupo => GRUPO_DE[id as IdHerramienta] ?? "datos";

/** Reparte lo que llega (ya en el orden de la persona) en los grupos, en el
 *  orden fijo de los grupos. Los grupos sin nada no salen. */
export function enGrupos<T extends { id: string }>(items: readonly T[]): Array<{ id: IdGrupo; label: string; items: T[] }> {
  return GRUPOS_BELEN.map((g) => ({ ...g, items: items.filter((x) => grupoDe(x.id) === g.id) })).filter((g) => g.items.length > 0);
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
