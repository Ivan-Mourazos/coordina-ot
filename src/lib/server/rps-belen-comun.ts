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

/** Fecha de calendario de RPS (medianoche, leída en UTC) → yyyy-mm-dd. Las de
 *  1899/1900 son «sin fecha». */
export const iso = (d: Date | null | undefined): string | null =>
  d && d.getUTCFullYear() > 1900 ? d.toISOString().slice(0, 10) : null;

/** Texto recortado; vacío → null. */
export const texto = (s: string | null | undefined): string | null => (s ?? "").trim() || null;
