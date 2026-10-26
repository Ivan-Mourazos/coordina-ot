// ─── No conformidades (NC) de RPS ────────────────────────────────────────────
// Calidad las abre en RPS (APQNonConformity) cuando algo sale mal en un pedido:
// una incidencia, una reclamación del cliente… Casi siempre llevan un PEDIDO
// RECTIFICATIVO, el que se abre para arreglarlo (en 2026, 274 de 392). Desde
// la NC se llega a los dos: `pedido` es el que falló y `rectificativo`, el que
// lo arregla.
//
// El «proceso afectado» dice de quién fue el fallo. Para Oficina Técnica y
// Diseño Gráfico es DISEÑO: RPS no los separa, y el que sea de una sección u
// otra lo dicen las tareas del pedido que falló. Medido en 2026: de 53 NC de
// DISEÑO, 34 eran de pedidos solo de OT, 2 solo de Diseño y 16 de los dos. Una
// NC de Comercial o de Compras en un pedido con tareas de OT no es de OT (ver
// `leerNcMetricas`).

/** Una NC, tal como se enseña en la ficha del pedido y en Métricas. */
export interface NoConformidad {
  codigo: string;
  /** Día en que se abrió, "AAAA-MM-DD". */
  fecha: string;
  /** El pedido en el que se produjo el fallo. */
  pedido: string | null;
  /** El pedido que se abrió para arreglarlo, si lo hay. */
  rectificativo: string | null;
  /** Procesos afectados, como los nombra RPS: "DISEÑO", "PRODUCCIÓN"… */
  procesos: string[];
  /** De dónde viene: "INCIDENCIA", "RECLAMACION DE CLIENTE"… */
  origen: string | null;
  /** Lo que escribió Calidad. Puede ser largo: se recorta al pintarlo. */
  descripcion: string;
  cerrada: boolean;
}

/** El proceso de RPS que es el de Oficina Técnica y Diseño Gráfico. */
export const PROCESO_DISENO = "DISEÑO";

/** El texto de Calidad en una línea, para la ficha: sin saltos y recortado. */
export function resumenNc(descripcion: string, max = 140): string {
  const plano = descripcion.replace(/\s+/g, " ").trim();
  return plano.length > max ? `${plano.slice(0, max - 1).trimEnd()}…` : plano;
}
