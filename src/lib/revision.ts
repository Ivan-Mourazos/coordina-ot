import type { EstadoOF, OF, Pedido } from "./types";

// ─── "Lo mío como revisor" ────────────────────────────────────────────────
// Única definición de qué OF le tocan a un operario en su rol de REVISOR. La
// usa el modo "Solo mías" de la pestaña Revisiones (RevisionView.tsx).
//
// La cabecera del tablero tenía unos contadores que salían de aquí, para que
// dijeran el mismo número que la pestaña. Se quitaron: repetían un dato que ya
// da la vista a la que llevan, y en el único sitio donde no se podía pulsar.
//
// `miId` nulo (identidad sin elegir todavía) no es revisor de nada: no
// revienta, simplemente no hay nada "mío".

/** Un pedido junto con el subconjunto de sus OF que interesa a la vista. */
export interface FacetRevision {
  pedido: Pedido;
  ofs: OF[];
}

/** OF de `pedidos`, agrupadas por pedido, en `estado` y con `miId` como
 *  revisor asignado. Solo incluye pedidos con al menos una OF que cumpla. */
export function facetsRevisorEnEstado(
  pedidos: Pedido[],
  estado: EstadoOF,
  miId: string | null,
): FacetRevision[] {
  if (!miId) return [];
  return pedidos
    .map((p) => ({
      pedido: p,
      ofs: p.ofs.filter((o) => o.estado === estado && o.revisorId === miId),
    }))
    .filter((f) => f.ofs.length > 0);
}

/** Lo que tengo ENTRE MANOS como revisor: lo que me han dejado y aún no he
 *  empezado, y lo que estoy revisando. Es la columna "Te toca revisar" de la
 *  zona personal del Panel (ZonaPersonal.tsx).
 *
 *  Lo ya aprobado o devuelto por mí no entra: eso es historia y se consulta en
 *  la pestaña Revisiones. Tampoco las cerradas en RPS, que salen del tablero
 *  igual que en el reparto por autor.
 *
 *  Por fecha planificada y, a igualdad, por código: el mismo orden que el
 *  resto de columnas del panel (ver `agruparPorFase`). */
export function facetsQueReviso(pedidos: Pedido[], miId: string | null): FacetRevision[] {
  if (!miId) return [];
  return pedidos
    .map((p) => ({
      pedido: p,
      ofs: p.ofs.filter(
        (o) =>
          o.revisorId === miId &&
          (o.estado === "por_revisar" || o.estado === "en_revision") &&
          o.cerradaRps === undefined,
      ),
    }))
    .filter((f) => f.ofs.length > 0)
    .sort((a, b) => {
      const fa = a.pedido.fechaPlanificacion || "9999-99-99";
      const fb = b.pedido.fechaPlanificacion || "9999-99-99";
      if (fa !== fb) return fa < fb ? -1 : 1;
      return a.pedido.codigo.localeCompare(b.pedido.codigo);
    });
}

/** Cuántas OF (sin agrupar por pedido) me tocan como revisor en `estado`. */
export function contarRevisorEnEstado(
  pedidos: Pedido[],
  estado: EstadoOF,
  miId: string | null,
): number {
  if (!miId) return 0;
  return pedidos.reduce(
    (n, p) => n + p.ofs.filter((o) => o.estado === estado && o.revisorId === miId).length,
    0,
  );
}
