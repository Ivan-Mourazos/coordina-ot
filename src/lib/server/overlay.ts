import type { Tablero } from "../data";
import type { EstadoOF, Situacion } from "../types";

// ─── Overlay: lo que CoordinaOT sabe y RPS no ────────────────────────────────
// PASAR A PRODUCCIÓN NO ES PARA SIEMPRE. La marca de completado se guarda por
// PEDIDO, y RPS puede habilitar una OF nueva en un pedido que ya se dio por
// terminado — pasa cuando el cliente añade trabajo y vuelven a escanear el
// parte. Con la marca mandando sola, ese pedido se quedaba en "Pasados a
// Producción" con una OF que nadie había hecho, sin autor y sin que nadie la
// viera (el caso AR.26.03914).
//
// Así que "completado" se DEDUCE: es completado si se pasó Y no le queda
// trabajo de OT por hacer. Si aparece una OF nueva, el pedido vuelve al
// tablero marcado con `reabiertoPor`, y cuando esa OF se resuelva volverá
// solo a completado. No se toca lo guardado: quién y cuándo lo pasó sigue
// siendo cierto y se conserva (ver `leerPedidosPasados`).
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
  /** Ver `OF.revisada`. Lo pone el SERVIDOR, no el cliente: se enciende solo
   *  cuando el estado que llega es `en_revision` y nunca se apaga (ver
   *  `guardarMutacion`). Va aquí para poder devolverlo al leer el overlay. */
  revisada?: boolean;
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

/** ¿Esta OF es trabajo de OT que todavía está por hacer?
 *
 *  Las anuladas no cuentan (ese trabajo se decidió no hacerlo) ni las ajenas a
 *  OT (no son nuestras). Del resto, solo `aprobada` está terminada: una OF
 *  pendiente, en curso, por revisar, en revisión o devuelta es trabajo vivo. */
function pendienteDeOT(of: { estado: string; ajenaOT?: boolean }): boolean {
  if (of.ajenaOT) return false;
  return of.estado !== "aprobada" && of.estado !== "anulada";
}

/** La situación que se enseña, que NO es la marca guardada.
 *
 *  Reabierto manda sobre completado, y se dice aquí en vez de en una condición
 *  suelta: un pedido reabierto tiene que salir del cajón de "pasados" pase lo
 *  que pase, también si la situación que traía ya venía en completado. Hoy RPS
 *  no la manda así nunca —siempre llega "procesado"—, pero de eso depende que
 *  un pedido con trabajo sin hacer no se quede escondido, y no puede depender
 *  de un detalle de otro fichero. */
function situacionDe(traida: Situacion, completado: boolean, reabierto: boolean): Situacion {
  if (reabierto) return traida === "completado" ? "procesado" : traida;
  return completado ? "completado" : traida;
}

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
          revisada: o.revisada ?? false,
        };
      });
      // Solo en los pasados: en un pedido normal, tener OF sin hacer es lo
      // esperado y no significa nada.
      const reabiertoPor = completado ? ofs.filter(pendienteDeOT).map((of) => of.id) : [];

      if (!completado && ofs.every((of, i) => of === p.ofs[i])) return p;
      return {
        ...p,
        situacion: situacionDe(p.situacion, completado, reabiertoPor.length > 0),
        ...(reabiertoPor.length > 0 ? { reabiertoPor } : {}),
        ofs,
      };
    }),
  };
}
