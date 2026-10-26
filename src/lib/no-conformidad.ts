import type { SeccionId } from "./secciones";

// ─── No conformidades (NC) de RPS ────────────────────────────────────────────
// Calidad las abre en RPS (APQNonConformity) cuando algo sale mal en un pedido:
// una incidencia, una reclamación del cliente… Casi siempre llevan un PEDIDO
// RECTIFICATIVO, el que se abre para arreglarlo (en 2026, 274 de 392). Desde
// la NC se llega a los dos: `pedido` es el que falló y `rectificativo`, el que
// lo arregla.
//
// DE QUIÉN FUE lo dicen las CAUSAS que Calidad apunta al investigarla
// (APQNCCause, colgadas de cada defecto): cada una lleva un tipo, el % con
// que contribuyó y, en la primera línea del texto, el nombre de la persona
// («TAMARA», «ADRIAN- Falta de formación.»). Son nuestras las de tipo «ERROR
// EN PLANTEAMIENDO O DISEÑO GRAFICO» (así, con la errata de RPS), y la
// persona dice si es de OT, de Diseño o de Impresión (Iván, 26/10/2026). En
// 2026: 54 causas de ese tipo, 49 con un nombre nuestro.
//
// Una NC recién abierta aún no tiene causas: Calidad la investiga después.
// Esas se enseñan aparte como «pendientes de investigar», en la sección cuyas
// tareas lleva el pedido. Ver docs/NO-CONFORMIDADES-E-INCIDENCIAS.md.

/** Una causa de la NC, como la apunta Calidad. */
export interface CausaNc {
  /** El tipo genérico: «ERROR EN PLANTEAMIENDO O DISEÑO GRAFICO»… */
  tipo: string | null;
  /** La primera línea del texto, que es donde Calidad pone a quién se le
   *  achaca: «TAMARA», «Juan Castro y Adrián Quinteiro Vaamonde,». */
  responsable: string;
  /** Las personas NUESTRAS que se reconocen en `responsable` (ver
   *  `RESPONSABLES`). Vacío si no es nadie del equipo. */
  quien: string[];
  /** El % con que contribuyó al fallo, si Calidad lo puso. */
  contribucion: number | null;
  /** El resto del texto: qué pasó. */
  texto: string;
}

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
  /** Las causas que apuntó Calidad al investigarla. Vacío si aún no. */
  causas: CausaNc[];
  /** Las secciones con tareas en el pedido que falló. Solo hace falta para
   *  las pendientes de investigar (ver `deLaSeccion`); en la ficha va vacío. */
  tareasDe: SeccionId[];
}

/** El proceso de RPS que es el de Oficina Técnica, Diseño e Impresión. */
export const PROCESO_DISENO = "DISEÑO";

/** Las personas que Calidad nombra en las causas, y su sección. Por la
 *  primera línea de la causa, sin tildes y en mayúsculas, como palabra entera.
 *  «MANUEL» solo no vale: hay un Manuel Rivadulla en fábrica. Lucía Guillín
 *  ya no está en el equipo pero sus causas son de OT (Iván, 26/10/2026). */
export const RESPONSABLES: readonly { id: string; nombre: string; seccion: SeccionId; alias: readonly string[] }[] = [
  { id: "alberto", nombre: "Alberto Carbon", seccion: "ot", alias: ["ALBERTO"] },
  { id: "jaime", nombre: "Jaime Vázquez", seccion: "ot", alias: ["JAIME"] },
  { id: "tamara", nombre: "Tamara Villar", seccion: "ot", alias: ["TAMARA"] },
  { id: "adrian", nombre: "Adrián Quinteiro", seccion: "ot", alias: ["ADRIAN"] },
  { id: "ivan", nombre: "Iván Sánchez", seccion: "ot", alias: ["IVAN"] },
  { id: "angel", nombre: "Ángel García", seccion: "ot", alias: ["ANGEL"] },
  { id: "lucia", nombre: "Lucía Guillín", seccion: "ot", alias: ["LUCIA"] },
  { id: "carron", nombre: "José Luis Carrón", seccion: "diseno", alias: ["CARRON"] },
  { id: "smith", nombre: "Francisco Javier Smith", seccion: "diseno", alias: ["SMITH"] },
  { id: "manuel", nombre: "Manuel Ramón Gómez", seccion: "impresion", alias: ["MANUEL GOMEZ", "MANUEL RAMON"] },
];

const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Quiénes del equipo nombra la primera línea de una causa. */
export function quienesEn(linea: string): string[] {
  const t = plano(linea);
  return RESPONSABLES.filter((r) => r.alias.some((a) => new RegExp(`(^|[^A-Z])${a}([^A-Z]|$)`).test(t))).map((r) => r.id);
}

/** ¿Es una causa nuestra? El tipo «ERROR EN PLANTEAMIENDO O DISEÑO GRAFICO»,
 *  con la errata de RPS y sin fiarse de ella ni de las tildes. */
export const esCausaNuestra = (c: Pick<CausaNc, "tipo">) => /PLANTEAMI|DISENO GRAFICO/.test(plano(c.tipo ?? ""));

/** Las secciones a las que se achaca la NC por sus causas nuestras: la de
 *  cada persona nombrada. Una causa nuestra sin nadie reconocido se lleva a
 *  la sección cuyas tareas lleva el pedido. Vacío si no tiene causas nuestras. */
export function seccionesDe(nc: Pick<NoConformidad, "causas" | "tareasDe">): SeccionId[] {
  const s = new Set<SeccionId>();
  for (const c of nc.causas.filter(esCausaNuestra)) {
    if (c.quien.length) for (const id of c.quien) s.add(RESPONSABLES.find((r) => r.id === id)!.seccion);
    else for (const t of nc.tareasDe) s.add(t);
  }
  return [...s];
}

/** ¿Qué es esta NC para la sección?
 *  · "causa": tiene una causa nuestra de alguien de la sección.
 *  · "pendiente": Calidad aún no la ha investigado (sin causas), el pedido
 *    lleva tareas de la sección y el proceso no la descarta (DISEÑO o sin
 *    proceso todavía). Puede acabar no siendo nuestra.
 *  · null: no es de la sección. */
export function deLaSeccion(nc: NoConformidad, seccion: SeccionId): "causa" | "pendiente" | null {
  if (seccionesDe(nc).includes(seccion)) return "causa";
  if (nc.causas.length === 0 && nc.tareasDe.includes(seccion) && papelDiseno(nc) !== "otro") return "pendiente";
  return null;
}

/** ¿Me la achacan a mí? Una causa nuestra que me nombra. */
export const esMia = (nc: Pick<NoConformidad, "causas">, operarioId: string) =>
  nc.causas.some((c) => esCausaNuestra(c) && c.quien.includes(operarioId));

/** Las NC de TODA la empresa en el periodo, con la parte nuestra. */
export interface TotalesNc {
  total: number;
  rectificadas: number;
  /** Con alguna causa nuestra (de planteamiento o diseño gráfico). */
  nuestras: number;
  nuestrasRectificadas: number;
  /** Las nuestras por sección, según la persona de la causa. Una NC con
   *  causas de dos secciones cuenta en las dos. */
  porSeccion: Record<SeccionId, { n: number; rectificadas: number }>;
  /** Aún sin causas: Calidad no las ha investigado. */
  sinInvestigar: number;
  /** El proceso afectado, que también cuenta (Iván, 26/10/2026): DISEÑO como
   *  principal o como secundario (ver `papelDiseno`). */
  disenoPrincipal: number;
  disenoSecundario: number;
}

export function totalesNc(todas: readonly NoConformidad[]): TotalesNc {
  const t: TotalesNc = {
    total: todas.length, rectificadas: 0, nuestras: 0, nuestrasRectificadas: 0,
    porSeccion: { ot: { n: 0, rectificadas: 0 }, diseno: { n: 0, rectificadas: 0 }, impresion: { n: 0, rectificadas: 0 } },
    sinInvestigar: 0, disenoPrincipal: 0, disenoSecundario: 0,
  };
  for (const nc of todas) {
    const rect = nc.rectificativo ? 1 : 0;
    t.rectificadas += rect;
    if (!nc.causas.length) t.sinInvestigar++;
    const papel = papelDiseno(nc);
    if (papel === "principal") t.disenoPrincipal++;
    if (papel === "secundario") t.disenoSecundario++;
    const secciones = seccionesDe(nc);
    if (!secciones.length) continue;
    t.nuestras++;
    t.nuestrasRectificadas += rect;
    for (const s of secciones) { t.porSeccion[s].n++; t.porSeccion[s].rectificadas += rect; }
  }
  return t;
}

/** Calidad todavía no le ha puesto proceso. */
export const sinClasificar = (nc: Pick<NoConformidad, "proceso1" | "proceso2">) => !nc.proceso1 && !nc.proceso2;

/** Qué papel tiene DISEÑO en la NC según el proceso afectado: no pesa igual
 *  que sea el principal que el secundario (Iván, 26/10/2026). Si viene en los
 *  dos huecos, cuenta como principal. */
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
  const t = descripcion.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Parte el texto de una causa en la persona (primera línea) y el resto. */
export function partirCausa(texto: string): { responsable: string; texto: string } {
  const lineas = texto.replace(/\r\n?/g, "\n").split("\n");
  return { responsable: (lineas[0] ?? "").trim().replace(/[,.\s-]+$/, ""), texto: lineas.slice(1).join("\n").trim() };
}
