import { ordenarPorIds } from "./orden-guardado";
import { LISTAS_BELEN } from "./vista-belen-listas";

export const HERRAMIENTAS_BELEN = [
  { id: "entregas", label: "Pedidos por fecha solicitada", explica: "Las OF por acabar: lo atrasado, lo de hoy, mañana y la semana, por la fecha que pidió el cliente." },
  ...LISTAS_BELEN,
];

/** Recupera preferencias antiguas y añade al final las herramientas nuevas. */
export function ordenarHerramientas(guardado: unknown): typeof HERRAMIENTAS_BELEN {
  return ordenarPorIds(HERRAMIENTAS_BELEN, guardado);
}
