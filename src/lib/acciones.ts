import type { EstadoOF, OF } from "./types";

// ─── Máquina de estados de OF: ÚNICA fuente de verdad ────────────────────────
// Fila del tablero (PedidoLinea), drawer y panel Mi fichaje pintan botones
// desde accionesDisponibles(); textos, confirmaciones y efecto sobre el
// fichaje viven aquí y solo aquí.

export type AccionOF =
  | "empezar_planteo" | "terminar_planteo" | "deshacer_empezar"
  | "empezar_revision" | "aprobar" | "devolver" | "reabrir" | "soltar_revision"
  | "retomar" | "anular" | "restaurar";

export interface AccionDef {
  id: AccionOF;
  label: string;
  tono: "primaria" | "peligro" | "neutra";
  confirmar?: string; // si existe, la UI pide confirmación con este texto
  desde: EstadoOF[];
  requiere?: "autor" | "revisor"; // asignación necesaria para ofrecerla
  /** Además de estar asignada, la acción es SOLO de esa persona.
   *
   *  Distinto de `requiere`: ese pide que haya alguien nombrado, esto pide que
   *  seas tú. Se usa en la revisión porque el revisor es un encargo con nombre,
   *  no una tarea que pueda echar una mano cualquiera: empezar la revisión de
   *  Tamara le fichaba el trabajo a quien pulsara, dejando la OF diciendo que
   *  la revisa ella. Para quedársela ya está "cambiar revisor", que es
   *  explícito y avisa a la interesada. */
  soloEl?: "revisor";
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
    desde: ["por_revisar"], requiere: "revisor", soloEl: "revisor",
    efectoFichaje: "arranca", destino: "en_revision" },
  { id: "aprobar", label: "Aprobar → Producción", tono: "primaria",
    confirmar: "La OF quedará aprobada y lista para Producción.",
    desde: ["en_revision"], efectoFichaje: "corta", destino: "aprobada" },
  { id: "devolver", label: "Devolver con nota", tono: "peligro",
    desde: ["en_revision"], efectoFichaje: "corta", conNota: true, destino: "devuelta" },
  // Salida de la revisión que no decide nada. Antes, una vez empezada, las dos
  // únicas puertas eran aprobar y devolver: si la abrías para echar un vistazo,
  // o te ponías a discutir el planteo con quien lo hizo, no había forma de
  // dejarla donde estaba. El planteo sí tenía su equivalente
  // ("Volver a pendiente") desde el primer día.
  { id: "soltar_revision", label: "Dejar sin revisar", tono: "neutra",
    confirmar: "La OF vuelve a la cola de por revisar. El tiempo ya fichado se conserva y sigue nombrado el mismo revisor.",
    desde: ["en_revision"], efectoFichaje: "corta", destino: "por_revisar" },
  { id: "reabrir", label: "Reabrir revisión", tono: "neutra",
    confirmar: "La OF volverá a revisión y dejará de estar lista para Producción.",
    desde: ["aprobada"], destino: "en_revision" },
  // Anular se decide al ver el pedido, y muchas veces con trabajo ya hecho: se
  // empezó a plantear y al final la hace el taller. Por eso vale desde
  // cualquier estado del ciclo salvo `aprobada` —esa ya se pasó a Producción y
  // el camino de vuelta es "reabrir"—, incluida `en_revision` y `devuelta`. El
  // tiempo ya fichado NO se borra: el corte cierra el tramo abierto con la hora
  // del servidor y se imputa igual (ver efectoFichaje en Board.ejecutarAccion).
  { id: "anular", label: "Anular OF", tono: "peligro",
    confirmar: "La OF quedará anulada (no se hace en Oficina Técnica). El tiempo ya fichado se conserva. Se puede restaurar.",
    desde: ["pendiente", "en_curso", "por_revisar", "en_revision", "devuelta"],
    efectoFichaje: "corta", destino: "anulada" },
  { id: "restaurar", label: "Restaurar", tono: "neutra",
    confirmar: "La OF anulada volverá a pendiente.",
    desde: ["anulada"], destino: "pendiente" },
];

const cumpleRequisito = (a: AccionDef, of: OF): boolean =>
  a.requiere === "autor" ? of.autorId !== null
  : a.requiere === "revisor" ? of.revisorId !== null
  : true;

/** Las acciones que se pueden ofrecer sobre esta OF.
 *
 *  `miId` es opcional a propósito: sin él se contesta "qué admite esta OF",
 *  que es lo que necesitan el reparto por pedido y los tests. Pasándolo se
 *  contesta "qué puedo hacer YO", que es lo que tiene que pintar la interfaz.
 *  Sin esa diferencia, cualquiera podía empezar la revisión de otro. */
export function accionesDisponibles(of: OF, miId?: string | null): AccionDef[] {
  return ACCIONES.filter(
    (a) =>
      a.desde.includes(of.estado) &&
      cumpleRequisito(a, of) &&
      !(a.soloEl === "revisor" && miId != null && of.revisorId !== miId),
  );
}

/** Aplica la transición de estado. NO toca el fichaje (eso es del Board). */
export function aplicarAccion(of: OF, accion: AccionOF, obs?: string): OF {
  const def = accionesDisponibles(of).find((a) => a.id === accion);
  if (!def) throw new Error(`Acción "${accion}" no disponible desde "${of.estado}"`);
  if (def.conNota && !obs?.trim()) throw new Error(`La acción "${def.label}" requiere una nota`);
  const estado = typeof def.destino === "function" ? def.destino(of) : def.destino;
  return { ...of, estado, ...(def.conNota ? { observacion: obs!.trim() } : {}) };
}
