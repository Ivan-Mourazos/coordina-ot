import type { EstadoOF, OF } from "./types";

// ─── Máquina de estados de OF: ÚNICA fuente de verdad ────────────────────────
// Tarjeta (PedidoChip), drawer y panel Mi fichaje pintan botones desde
// accionesDisponibles(); textos, confirmaciones y efecto sobre el fichaje
// viven aquí y solo aquí.

export type AccionOF =
  | "empezar_planteo" | "terminar_planteo" | "deshacer_empezar"
  | "empezar_revision" | "aprobar" | "devolver" | "reabrir"
  | "retomar" | "anular" | "restaurar";

export interface AccionDef {
  id: AccionOF;
  label: string;
  tono: "primaria" | "peligro" | "neutra";
  confirmar?: string; // si existe, la UI pide confirmación con este texto
  desde: EstadoOF[];
  requiere?: "autor" | "revisor"; // asignación necesaria para ofrecerla
  efectoFichaje?: "corta" | "arranca"; // lo ejecuta el Board sobre el motor
  conNota?: boolean; // requiere observación (devolver)
  destino: EstadoOF | ((of: OF) => EstadoOF);
}

export const ACCIONES: AccionDef[] = [
  { id: "empezar_planteo", label: "Empezar planteo", tono: "primaria",
    desde: ["pendiente"], requiere: "autor", efectoFichaje: "arranca", destino: "en_curso" },
  { id: "retomar", label: "Retomar planteo", tono: "primaria",
    desde: ["devuelta"], requiere: "autor", efectoFichaje: "arranca", destino: "en_curso" },
  { id: "terminar_planteo", label: "Pasar a revisión", tono: "primaria",
    desde: ["en_curso", "devuelta"], efectoFichaje: "corta", destino: "por_revisar" },
  { id: "deshacer_empezar", label: "Volver a pendiente", tono: "neutra",
    confirmar: "La OF volverá a pendiente. El tiempo ya fichado se conserva.",
    desde: ["en_curso"], efectoFichaje: "corta", destino: "pendiente" },
  { id: "empezar_revision", label: "Empezar revisión", tono: "primaria",
    desde: ["por_revisar"], requiere: "revisor", efectoFichaje: "arranca", destino: "en_revision" },
  { id: "aprobar", label: "Aprobar → Producción", tono: "primaria",
    confirmar: "La OF quedará aprobada y lista para Producción.",
    desde: ["en_revision"], efectoFichaje: "corta", destino: "aprobada" },
  { id: "devolver", label: "Devolver con nota", tono: "peligro",
    desde: ["en_revision"], efectoFichaje: "corta", conNota: true, destino: "devuelta" },
  { id: "reabrir", label: "Reabrir revisión", tono: "neutra",
    confirmar: "La OF volverá a revisión y dejará de estar lista para Producción.",
    desde: ["aprobada"], destino: "en_revision" },
  { id: "anular", label: "Anular OF", tono: "peligro",
    confirmar: "La OF quedará anulada (no se hace en Oficina Técnica). Se puede restaurar.",
    desde: ["pendiente", "en_curso", "por_revisar"], efectoFichaje: "corta", destino: "anulada" },
  { id: "restaurar", label: "Restaurar", tono: "neutra",
    confirmar: "La OF anulada volverá a pendiente.",
    desde: ["anulada"], destino: "pendiente" },
];

const cumpleRequisito = (a: AccionDef, of: OF): boolean =>
  a.requiere === "autor" ? of.autorId !== null
  : a.requiere === "revisor" ? of.revisorId !== null
  : true;

export function accionesDisponibles(of: OF): AccionDef[] {
  return ACCIONES.filter((a) => a.desde.includes(of.estado) && cumpleRequisito(a, of));
}

/** Aplica la transición de estado. NO toca el fichaje (eso es del Board). */
export function aplicarAccion(of: OF, accion: AccionOF, obs?: string): OF {
  const def = accionesDisponibles(of).find((a) => a.id === accion);
  if (!def) throw new Error(`Acción "${accion}" no disponible desde "${of.estado}"`);
  if (def.conNota && !obs?.trim()) throw new Error(`La acción "${def.label}" requiere una nota`);
  const estado = typeof def.destino === "function" ? def.destino(of) : def.destino;
  return { ...of, estado, ...(def.conNota ? { observacion: obs!.trim() } : {}) };
}
