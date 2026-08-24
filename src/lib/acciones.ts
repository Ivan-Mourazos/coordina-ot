import type { EstadoOF, OF } from "./types";

// ─── Máquina de estados de OF: ÚNICA fuente de verdad ────────────────────────
// Fila del tablero (PedidoLinea), drawer y panel Mi fichaje pintan botones
// desde accionesDisponibles(); textos, confirmaciones y efecto sobre el
// fichaje viven aquí y solo aquí.

export type AccionOF =
  | "empezar_planteo" | "terminar_planteo" | "recuperar_planteo"
  | "empezar_revision" | "aprobar" | "aprobar_corregida" | "aprobar_sin_revision"
  | "devolver" | "reabrir"
  | "soltar_revision"
  | "retomar" | "anular" | "restaurar";

export interface AccionDef {
  id: AccionOF;
  label: string;
  tono: "primaria" | "peligro" | "neutra";
  confirmar?: string; // si existe, la UI pide confirmación con este texto
  desde: EstadoOF[];
  requiere?: "autor" | "revisor"; // asignación necesaria para ofrecerla
  /** Solo se ofrece si la OF NO tiene revisor nombrado.
   *
   *  Es lo contrario de `requiere`, y hace falta para que "Dar por bueno sin
   *  revisión" y "Dar por corregida" no salgan las dos a la vez: son la misma
   *  transición —a `aprobada` sin pasar por revisión— pero cuentan cosas
   *  distintas (una nunca se revisó, la otra ya la revisaron y se corrigió), y
   *  ofrecerlas juntas obligaría a adivinar cuál pulsar. */
  sinRevisor?: boolean;
  /** Además de estar asignada, la acción es SOLO de esa persona.
   *
   *  Distinto de `requiere`: ese pide que haya alguien nombrado, esto pide que
   *  seas tú. Empezó siendo cosa de la revisión —empezar la revisión de Tamara
   *  le fichaba el trabajo a quien pulsara, dejando la OF diciendo que la
   *  revisa ella— y ahora cubre los dos roles, que es lo que hacía falta: al
   *  autor de una OF en revisión se le ofrecían "Aprobar", "Devolver con nota"
   *  y "Dejar sin revisar", o sea las tres decisiones del compañero que la
   *  estaba repasando. Pulsarlas era aprobarse el trabajo a sí mismo, y la
   *  regla dura del dominio dice justo lo contrario: revisor ≠ autor.
   *
   *  Cada estado tiene dueño y por eso la interfaz puede enseñar UNA fila de
   *  botones sin pedir permiso: en_curso y devuelta son del autor, por_revisar
   *  y en_revision son del revisor. Lo que no es tuyo no sale — no sale
   *  apagado, no sale con un aviso: no sale. */
  soloEl?: "autor" | "revisor";
  efectoFichaje?: "corta" | "arranca"; // lo ejecuta el Board sobre el motor
  conNota?: boolean; // requiere observación (devolver)
  /** Requiere elegir POR QUÉ (anular). Viaja por el mismo sitio que `conNota`
   *  —el campo `observacion`— pero codificado; ver lib/anulacion.ts. */
  conMotivo?: boolean;
  destino: EstadoOF | ((of: OF) => EstadoOF);
}

export const ACCIONES: AccionDef[] = [
  { id: "empezar_planteo", label: "Empezar planteo", tono: "primaria",
    desde: ["pendiente"], requiere: "autor", efectoFichaje: "arranca", destino: "en_curso" },
  { id: "retomar", label: "Retomar planteo", tono: "primaria",
    desde: ["devuelta"], requiere: "autor", efectoFichaje: "arranca", destino: "en_curso" },
  // Del AUTOR: es él quien da su planteo por terminado y nombra al revisor.
  // Sin `soloEl`, cualquiera que abriera la OF podía mandar a revisar el
  // trabajo a medias de otro.
  { id: "terminar_planteo", label: "Pasar a revisión", tono: "primaria",
    desde: ["en_curso", "devuelta"], requiere: "autor", soloEl: "autor",
    efectoFichaje: "corta", destino: "por_revisar" },
  // AQUÍ HABÍA un "deshacer empezar" que devolvía la OF a "sin empezar". Se
  // quitó, y no por sitio: es que decía una mentira. Una OF con tiempo fichado
  // NO está sin empezar, y ese botón la dejaba diciendo que sí.
  //
  // Además ya no cubre ningún hueco. Para dejar de trabajar un rato está
  // Pausar, que para el reloj sin tocar la OF; y para soltarla del todo está
  // quitar el autor, que la devuelve a la bandeja para que la coja otro.
  { id: "empezar_revision", label: "Empezar revisión", tono: "primaria",
    desde: ["por_revisar"], requiere: "revisor", soloEl: "revisor",
    efectoFichaje: "arranca", destino: "en_revision" },
  // "Aprobar → Producción" sonaba a que aprobar la mandaba a Producción, y no:
  // la OF vuelve a su autor como lista, y el pedido se pasa entero (y a mano)
  // cuando lo están todas. El "→ quién" lo pone `etiquetaAccion` con el nombre
  // del autor, que es a quien le llega.
  // Trabajo que NO lleva revisión: hay clientes que siempre hace la misma
  // persona —ASSA ABLOY es de Tamara— y montar una revisión ahí es papeleo por
  // el papeleo. Hasta ahora, para pasarlos había que ir a la herramienta vieja.
  //
  // Es del AUTOR y solo desde `en_curso`. NO desde `devuelta`: si te la
  // devolvieron es que hay un revisor metido y ya opinó — saltárselo por esta
  // puerta le quitaría la última palabra sobre un trabajo que él marcó como
  // incompleto.
  //
  // El revisor se queda a null, y eso es lo que distingue en el histórico una
  // OF que nadie revisó de una que sí. Ver `aprobadaSinRevision`.
  { id: "aprobar_sin_revision", label: "Dar por bueno sin revisión", tono: "neutra",
    confirmar: "La OF queda aprobada SIN que nadie la revise, y el pedido podrá pasar a Producción. Para trabajo que no lleva revisión; si tiene que verlo otra persona, usa \"Pasar a revisión\".",
    desde: ["en_curso"], requiere: "autor", soloEl: "autor", sinRevisor: true,
    efectoFichaje: "corta", destino: "aprobada" },
  { id: "aprobar", label: "Aprobar", tono: "primaria",
    confirmar: "La OF queda aprobada y vuelve a su autor como lista. El pedido se pasa a Producción aparte, cuando lo estén todas sus OF.",
    desde: ["en_revision"], requiere: "revisor", soloEl: "revisor",
    efectoFichaje: "corta", destino: "aprobada" },
  // Atajo para la segunda vuelta: la OF ya la revisó alguien, la devolvió con
  // una nota y el autor ha hecho el retoque. Si el cambio era mínimo, obligar a
  // otra ronda de revisión completa es papeleo — y lo que pasaba de verdad es
  // que se mandaba a revisar y quedaba ahí parada esperando a que alguien la
  // volviera a abrir para decir "sí, vale".
  //
  // NO sustituye a pasar a revisión: es la alternativa, y por eso va en tono
  // neutro. El camino que se ofrece primero sigue siendo el de siempre.
  //
  // Acción propia y no "aprobar" desde `devuelta`: lo que se aprueba aquí es la
  // CORRECCIÓN, no un planteo revisado, y el registro tiene que poder
  // distinguirlas. Quién la revisó sigue guardado en `revisorId`.
  //
  // Y es del AUTOR: la corrección la hace él, así que es él quien dice que ya
  // está. El revisor que quiera cerrarla tiene "Aprobar" tras reabrirla.
  // TAMBIÉN desde `en_curso`, y esto tapa un agujero que despistaba: fichar en
  // una OF devuelta dispara `retomar` (ver accionAlFichar), que la pasa a
  // `en_curso`. Con el botón atado solo a `devuelta`, ponerte a corregir con el
  // reloj en marcha lo hacía DESAPARECER sin decir nada, y desde ahí lo único
  // que quedaba era mandarla otra vez a revisión: una segunda vuelta que nadie
  // pedía, provocada por haber fichado el rato que costó el arreglo.
  //
  // `requiere: "revisor"` es lo que lo acota: una OF en curso CON revisor
  // nombrado es una que ya pasó por revisión. Sin revisor, lo que sale es "Dar
  // por bueno sin revisión", que cuenta otra cosa.
  { id: "aprobar_corregida", label: "Dar por corregida", tono: "neutra",
    confirmar: "La OF queda aprobada sin pasar otra vez por revisión.",
    desde: ["devuelta", "en_curso"], requiere: "revisor", soloEl: "autor",
    efectoFichaje: "corta", destino: "aprobada" },
  { id: "devolver", label: "Devolver con nota", tono: "peligro",
    desde: ["en_revision"], requiere: "revisor", soloEl: "revisor",
    efectoFichaje: "corta", conNota: true, destino: "devuelta" },
  // Salida de la revisión que no decide nada. Antes, una vez empezada, las dos
  // únicas puertas eran aprobar y devolver: si la abrías para echar un vistazo,
  // o te ponías a discutir el planteo con quien lo hizo, no había forma de
  // dejarla donde estaba. El planteo sí tenía su equivalente
  // ("Volver a pendiente") desde el primer día.
  { id: "soltar_revision", label: "Dejar sin revisar", tono: "neutra",
    confirmar: "La OF vuelve a la cola de por revisar. El tiempo ya fichado se conserva y sigue nombrado el mismo revisor.",
    desde: ["en_revision"], requiere: "revisor", soloEl: "revisor",
    efectoFichaje: "corta", destino: "por_revisar" },
  // El autor se arrepiente: mandó la OF a revisar y al momento se da cuenta de
  // que le faltaba algo. Sin esto había que pedirle al revisor que la soltara,
  // o peor, que la revisara sabiendo que estaba mal.
  //
  // Solo desde `por_revisar`, NO desde `en_revision`: en cuanto el revisor la
  // coge, el trabajo ya es suyo y quitársela de las manos sin avisar le borra
  // el rato que lleva mirándola. Ahí lo que toca es hablarlo, y el revisor la
  // devuelve o la suelta.
  //
  // El revisor nombrado se CONSERVA: la OF sale de su panel sola (Revisiones
  // filtra por estado), y al volver a mandarla el selector ya viene con él
  // puesto, que es lo normal cuando solo hubo que retocar un detalle.
  { id: "recuperar_planteo", label: "Recuperar para plantear", tono: "neutra",
    confirmar: "La OF vuelve a tu planteo y desaparece de la lista de quien la iba a revisar. El tiempo ya fichado se conserva.",
    desde: ["por_revisar"], requiere: "autor", soloEl: "autor",
    destino: "en_curso" },
  // La única del ciclo que NO lleva dueño, y a propósito: deshacer una
  // aprobación le puede tocar a los dos. El revisor se da cuenta de que se le
  // pasó algo, y el autor —que es a quien vuelve la OF aprobada, y quien la va
  // a pasar a Producción— ve el fallo justo al ir a pasarla. Cerrarle la puerta
  // a uno de los dos obligaría a pedírselo al otro por el pasillo.
  { id: "reabrir", label: "Reabrir revisión", tono: "neutra",
    confirmar: "La OF volverá a revisión y dejará de estar lista para Producción.",
    desde: ["aprobada"], destino: "en_revision" },
  // Anular se decide al ver el pedido, y muchas veces con trabajo ya hecho: se
  // empezó a plantear y al final la hace el taller. Por eso vale desde
  // cualquier estado del ciclo salvo `aprobada` —esa ya se pasó a Producción y
  // el camino de vuelta es "reabrir"—, incluida `en_revision` y `devuelta`. El
  // tiempo ya fichado NO se borra: el corte cierra el tramo abierto con la hora
  // del servidor y se imputa igual (ver efectoFichaje en Board.ejecutarAccion).
  // Sin `confirmar`: la confirmación es elegir POR QUÉ, que además deja el
  // motivo escrito. Un diálogo de sí/no encima sería preguntar dos veces.
  { id: "anular", label: "Anular OF", tono: "peligro", conMotivo: true,
    desde: ["pendiente", "en_curso", "por_revisar", "en_revision", "devuelta"],
    efectoFichaje: "corta", destino: "anulada" },
  { id: "restaurar", label: "Restaurar", tono: "neutra",
    confirmar: "La OF anulada volverá a pendiente.",
    desde: ["anulada"], destino: "pendiente" },
];

const quienTiene = (rol: "autor" | "revisor", of: OF): string | null =>
  rol === "autor" ? of.autorId : of.revisorId;

const cumpleRequisito = (a: AccionDef, of: OF): boolean =>
  a.requiere === undefined || quienTiene(a.requiere, of) !== null;

/** ¿Es MÍA esta acción? Sin `soloEl` lo es de cualquiera; sin identidad
 *  elegida no se recorta nada (ver `accionesDisponibles`). */
/** ¿Cumple el "y además, sin revisor"? Ver `AccionDef.sinRevisor`. */
const cumpleSinRevisor = (a: AccionDef, of: OF): boolean =>
  !a.sinRevisor || of.revisorId === null;

const esMia = (a: AccionDef, of: OF, miId: string | null | undefined): boolean =>
  a.soloEl === undefined || miId == null || quienTiene(a.soloEl, of) === miId;

/** Las acciones que se pueden ofrecer sobre esta OF.
 *
 *  `miId` es opcional a propósito: sin él se contesta "qué admite esta OF",
 *  que es lo que necesitan el reparto por pedido y los tests. Pasándolo se
 *  contesta "qué puedo hacer YO", que es lo que tiene que pintar la interfaz.
 *  Sin esa diferencia, el autor veía los tres botones del revisor sobre su
 *  propia OF. */
export function accionesDisponibles(of: OF, miId?: string | null): AccionDef[] {
  return ACCIONES.filter(
    (a) =>
      a.desde.includes(of.estado) &&
      cumpleRequisito(a, of) &&
      cumpleSinRevisor(a, of) &&
      esMia(a, of, miId),
  );
}

/** Cómo se llama la acción EN ESTA OF.
 *
 *  Solo "aprobar" cambia: lleva detrás a QUIÉN le llega la OF aprobada, que es
 *  su autor. Antes ponía "→ Producción" y se leía como que aprobar ya la
 *  mandaba allí; el pedido lo pasa alguien, después y a mano, cuando están
 *  todas. Sin autor conocido se queda en "Aprobar" a secas: mejor corto que
 *  una flecha que no apunta a nadie. */
export function etiquetaAccion(
  def: AccionDef,
  of: OF,
  nombreDe: (id: string) => string | undefined,
): string {
  if (def.id !== "aprobar") return def.label;
  const autor = of.autorId ? nombreDe(of.autorId) : undefined;
  return autor ? `${def.label} → ${autor}` : def.label;
}

/** Aplica la transición de estado. NO toca el fichaje (eso es del Board). */
export function aplicarAccion(of: OF, accion: AccionOF, obs?: string): OF {
  const def = accionesDisponibles(of).find((a) => a.id === accion);
  if (!def) throw new Error(`Acción "${accion}" no disponible desde "${of.estado}"`);
  // `conMotivo` viaja por el mismo campo: sin texto no hay acción.
  if ((def.conNota || def.conMotivo) && !obs?.trim())
    throw new Error(`La acción "${def.label}" requiere una nota`);
  const estado = typeof def.destino === "function" ? def.destino(of) : def.destino;
  return {
    ...of,
    estado,
    ...(def.conNota || def.conMotivo ? { observacion: obs!.trim() } : {}),
  };
}

/** ¿Esta OF llegó a "aprobada" sin que nadie la revisara?
 *
 *  Se sabe porque no tiene revisor: los dos caminos normales a `aprobada`
 *  —"Aprobar" y "Dar por corregida"— exigen uno, así que un hueco ahí solo lo
 *  deja `aprobar_sin_revision`.
 *
 *  Importa para que el histórico no mienta: "Aprobada" a secas se lee como
 *  "alguien la repasó y le dio el visto bueno", y en estas no pasó.
 */
export function aprobadaSinRevision(of: OF): boolean {
  return of.estado === "aprobada" && of.revisorId === null;
}
