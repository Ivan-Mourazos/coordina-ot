import { LISTAS_BELEN } from "./vista-belen-listas";

export const HERRAMIENTAS_BELEN = [
  { id: "entregas", label: "Pedidos por día de entrega", explica: "Lo atrasado, lo de hoy, mañana y la semana, por la fecha que pidió el cliente." },
  ...LISTAS_BELEN,
];

/** Recupera preferencias antiguas y añade al final las herramientas nuevas. */
export function ordenarHerramientas(guardado: unknown): typeof HERRAMIENTAS_BELEN {
  const ids = Array.isArray(guardado) ? [...new Set(guardado.filter((v): v is string => typeof v === "string"))] : [];
  return [
    ...ids.flatMap((id) => HERRAMIENTAS_BELEN.filter((h) => h.id === id)),
    ...HERRAMIENTAS_BELEN.filter((h) => !ids.includes(h.id)),
  ];
}
