import type { Tablero } from "../data";
import type { EstadoOF } from "../types";

// ─── Overlay: lo que CoordinaOT sabe y RPS no ────────────────────────────────
// RPS es la fuente de los DATOS del trabajo (pedidos, OFs, tiempos, material);
// el overlay es la fuente del FLUJO de OT: quién plantea, quién revisa, en qué
// estado del ciclo está cada OF y qué pedidos se dieron por completados.
// Se guarda en SQLite (estado-db.ts) y aquí solo vive la fusión pura, para
// poder testearla sin base de datos.

export interface CambioOF {
  ofId: string;
  autorId: string | null;
  revisorId: string | null;
  estado: EstadoOF;
  observacion: string | null;
}

export interface Overlay {
  /** Por id de OF. La existencia de fila = "esta OF la gestiona CoordinaOT":
   *  sus 4 campos sustituyen SIEMPRE a los derivados de RPS. */
  ofs: Map<string, CambioOF>;
  /** Ids de pedido marcados como completados (pasados a Producción). */
  pedidosCompletados: Set<string>;
}

export const ESTADOS_OF: ReadonlySet<string> = new Set([
  "pendiente",
  "en_curso",
  "por_revisar",
  "en_revision",
  "aprobada",
  "devuelta",
  "anulada",
]);

/** Fusión pura tablero (mock o RPS) + overlay. No muta la entrada. */
export function aplicarOverlay(tablero: Tablero, overlay: Overlay): Tablero {
  if (overlay.ofs.size === 0 && overlay.pedidosCompletados.size === 0)
    return tablero;
  return {
    operarios: tablero.operarios,
    pedidos: tablero.pedidos.map((p) => {
      const completado = overlay.pedidosCompletados.has(p.id);
      const ofs = p.ofs.map((of) => {
        const o = overlay.ofs.get(of.id);
        if (!o) return of;
        return {
          ...of,
          autorId: o.autorId,
          revisorId: o.revisorId,
          estado: o.estado,
          observacion: o.observacion ?? undefined,
        };
      });
      if (!completado && ofs.every((of, i) => of === p.ofs[i])) return p;
      return {
        ...p,
        situacion: completado ? ("completado" as const) : p.situacion,
        ofs,
      };
    }),
  };
}
