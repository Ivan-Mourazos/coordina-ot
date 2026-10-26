import type { SeccionId } from "./secciones";

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
  /** Los dos procesos afectados, como los nombra RPS ("DISEÑO",
   *  "PRODUCCIÓN"…). El ORDEN cuenta: el 1 es el principal, al que Calidad
   *  achaca el fallo, y el 2 el que también tuvo parte. null si no lo puso. */
  proceso1: string | null;
  proceso2: string | null;
  /** De dónde viene: "INCIDENCIA", "RECLAMACION DE CLIENTE"… */
  origen: string | null;
  /** Lo que escribió Calidad. Puede ser largo: se recorta al pintarlo. */
  descripcion: string;
  /** El seguimiento de Calidad: qué se investigó, a quién se avisó… Suele
   *  traer justo lo que OT necesita saber («un Electra con guías no puede
   *  llevar perfil universal 280»). Vacío si no hay. */
  comentarios: string;
  cerrada: boolean;
}

/** Las NC de TODA la empresa en el periodo y, de ellas, las de DISEÑO —las
 *  nuestras, OT y Diseño Gráfico juntos, que RPS no separa— como proceso
 *  principal y como secundario (ver `papelDiseno`). Cada cosa en NC y en
 *  rectificados (las que traen pedido rectificativo). Es la cifra de la casa:
 *  la parte de cada sección va aparte, por las tareas del pedido. */
export interface TotalesNc {
  total: number;
  rectificadas: number;
  disenoPrincipal: number;
  disenoPrincipalRectificadas: number;
  disenoSecundario: number;
  disenoSecundarioRectificadas: number;
  sinClasificar: number;
  /** Las de DISEÑO repartidas POR NOMBRE de sección, según las tareas del
   *  pedido que falló (Iván, 26/10/2026). Con tareas de varias secciones
   *  cuenta en cada una, así que la suma puede pasar del total; sin tareas de
   *  ninguna, en `ninguna`. */
  porSeccion: Record<SeccionId | "ninguna", { principal: number; secundario: number; rectificadas: number }>;
}

/** El proceso de RPS que es el de Oficina Técnica y Diseño Gráfico. */
export const PROCESO_DISENO = "DISEÑO";

/** Calidad todavía no ha dicho de quién fue: la NC está recién abierta y sin
 *  procesos. Las de octubre de 2026 están casi todas así (NC010176, NC010188).
 *  Se cuentan igual en la sección, aparte, para que no se pierdan mientras
 *  Calidad las completa (Iván, 26/10/2026). */
export const sinClasificar = (nc: Pick<NoConformidad, "proceso1" | "proceso2">) => !nc.proceso1 && !nc.proceso2;

/** Qué papel tiene DISEÑO (nosotros: OT y Diseño Gráfico) en la NC. Los
 *  rectificados «nuestros» son los de DISEÑO (Iván, 26/10/2026), y no pesa
 *  igual que sea el proceso principal que el secundario: hay que distinguirlo.
 *  Si viene en los dos huecos, cuenta como principal. */
export type PapelDiseno = "principal" | "secundario" | "sinClasificar" | "otro";
export function papelDiseno(nc: Pick<NoConformidad, "proceso1" | "proceso2">): PapelDiseno {
  if (nc.proceso1 === PROCESO_DISENO) return "principal";
  if (nc.proceso2 === PROCESO_DISENO) return "secundario";
  return sinClasificar(nc) ? "sinClasificar" : "otro";
}

/** Los procesos para leer, en su orden: «DISEÑO (principal) · COMERCIAL». */
export function textoProcesos(nc: Pick<NoConformidad, "proceso1" | "proceso2">): string {
  if (sinClasificar(nc)) return "sin proceso todavía";
  return [nc.proceso1 && `${nc.proceso1} (principal)`, nc.proceso2 && `${nc.proceso2} (secundario)`]
    .filter(Boolean)
    .join(" · ");
}

/** El texto de Calidad en una línea, para la ficha: sin saltos y recortado. */
export function resumenNc(descripcion: string, max = 140): string {
  const plano = descripcion.replace(/\s+/g, " ").trim();
  return plano.length > max ? `${plano.slice(0, max - 1).trimEnd()}…` : plano;
}
