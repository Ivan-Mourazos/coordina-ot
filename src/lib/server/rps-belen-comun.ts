import type { AvisoOF } from "../vista-belen";

// ─── Lo común a las consultas de la vista de Belén ───────────────────────────
// Antes estaba copiado en vista-belen-db.ts y vista-belen-listas-db.ts.

/** Característica de la OF con la fecha comprometida (texto MM/DD/AAAA). Vale
 *  la ÚLTIMA que se apuntó (RowTimestamp), en la ficha y en las listas. */
export const FEATURE_COMPROMETIDA = "e655eb1f-3f23-4ccb-846b-9e145d3b8df6";

/** Tipo del aviso colgado de una tarea: TP (trabajo previo) o COT (consulta
 *  con Oficina Técnica). Esas tareas son visitas, no trabajo de taller. */
export const TIPO_AVISO: Readonly<Record<string, AvisoOF["tipo"]>> = {
  "001-tp": "TP",
  "cdf68c47-3473-4abd-b32e-5dc5f42fb2a3": "COT",
};

export const ES_RPS = () => process.env.DATASOURCE === "rps";

/** Duración EXACTA de un fichaje, en segundos. RPS guarda la hora de inicio y
 *  de fin (StartHour, EndHour) en segundos desde la medianoche; ExecutionTime
 *  son esos mismos minutos ya REDONDEADOS (comprobado el 11/11/2026: cuadra
 *  redondeando en 22.916 de 23.127 fichajes). Se usa la diferencia; si cruzara
 *  la medianoche se le suma un día, y si faltara una hora, ExecutionTime. */
export const SEGUNDOS_FICHAJE = (i: string) => `
  CASE WHEN ${i}.StartHour IS NULL OR ${i}.EndHour IS NULL THEN ${i}.ExecutionTime * 60
       WHEN ${i}.EndHour >= ${i}.StartHour THEN ${i}.EndHour - ${i}.StartHour
       ELSE ${i}.EndHour + 86400 - ${i}.StartHour END`;

/** Los fichajes de menos de un minuto no salen ni suman (Iván, 11/11/2026:
 *  «solo rellenan de ruido»). Son el 31 % y casi todos de abrir y cerrar. */
export const SEGUNDOS_MINIMOS = 60;

/** Segundos desde la medianoche → «07:33». */
export const horaDeSegundos = (s: number | null | undefined): string | null =>
  s === null || s === undefined || s < 0
    ? null
    : `${String(Math.floor(s / 3600) % 24).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;

/** Fecha de calendario de RPS (medianoche, leída en UTC) → yyyy-mm-dd. Las de
 *  1899/1900 son «sin fecha», y también el 1/1/1970 (sale en pedidos antiguos). */
export const iso = (d: Date | null | undefined): string | null =>
  d && d.getUTCFullYear() > 1970 ? d.toISOString().slice(0, 10) : null;

/** Texto recortado; vacío → null. */
export const texto = (s: string | null | undefined): string | null => (s ?? "").trim() || null;
