import type { NotaPedido } from "./nota-pedido";

// ─── La campana de notas de Belén ────────────────────────────────────────────
// Antes guardaba qué notas había visto, una a una; la primera vez que entraba
// no había visto ninguna y le saltaban TODAS las de la última semana, así que
// dejó de mirarla (Iván, 12/11/2026). Ahora:
//   · Hay una MARCA «desde»: lo escrito antes no avisa. Se pone al entrar por
//     primera vez y al pulsar «Marcar todo como visto».
//   · Por encima de la marca, las notas que ya abrió.
//   · Un aviso por PEDIDO con cuántas notas nuevas trae, no uno por nota.

export interface MarcaAvisos {
  /** ISO: las notas de antes no avisan. */
  desde: string;
  /** Notas posteriores a `desde` que ya abrió. */
  vistas: number[];
}

/** Lee la marca guardada; sin marca (o con la lista vieja de ids) empieza
 *  AHORA, que es justo lo que evita el aluvión del primer día. */
export function leerMarca(guardado: string | null, ahora: string): MarcaAvisos {
  try {
    const v: unknown = guardado ? JSON.parse(guardado) : null;
    if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as MarcaAvisos).desde === "string") {
      const vistas = (v as MarcaAvisos).vistas;
      return { desde: (v as MarcaAvisos).desde, vistas: Array.isArray(vistas) ? vistas.filter((n) => typeof n === "number") : [] };
    }
  } catch {
    /* Marca rota: se empieza de cero, como la primera vez. */
  }
  return { desde: ahora, vistas: [] };
}

export interface AvisoPedido {
  pedido: string;
  /** Las notas nuevas del pedido, la más reciente primero. */
  notas: NotaPedido[];
}

/** Las notas que avisan, juntas por pedido; el pedido con la nota más
 *  reciente, arriba. Solo las «para todos» y que no escribió ella. */
export function avisosPendientes(notas: readonly NotaPedido[], marca: MarcaAvisos, miId: string | null): AvisoPedido[] {
  const desde = Date.parse(marca.desde);
  const nuevas = notas
    .filter((n) => n.publica && n.operarioId !== miId && Date.parse(n.creadoAt) > desde && !marca.vistas.includes(n.id))
    .sort((a, b) => Date.parse(b.creadoAt) - Date.parse(a.creadoAt));
  const porPedido = new Map<string, NotaPedido[]>();
  for (const n of nuevas) porPedido.set(n.pedido, [...(porPedido.get(n.pedido) ?? []), n]);
  return [...porPedido].map(([pedido, delPedido]) => ({ pedido, notas: delPedido }));
}

/** Marca como vistas las notas de un pedido; de paso olvida las vistas que ya
 *  no llegan (la ventana de la API es de unos días), para que no crezca. */
export function marcarVistas(marca: MarcaAvisos, ids: readonly number[], notas: readonly NotaPedido[]): MarcaAvisos {
  const siguen = new Set(notas.map((n) => n.id));
  return { desde: marca.desde, vistas: [...new Set([...marca.vistas, ...ids])].filter((id) => siguen.has(id)) };
}
