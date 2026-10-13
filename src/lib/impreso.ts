import { ofsQueCuentan } from "./fases-tablero";
import type { OF, Pedido } from "./types";
import type { Seccion } from "./secciones";
import type { AccionOF } from "./acciones";

// ─── «Impreso»: el único gesto de Impresión Digital ──────────────────────────
// En Impresión no revisa nadie (ver `Seccion.sinRevision`): se imprime y se
// pasa. El botón aprueba las OF del pedido y luego el Board lo pasa a
// Producción con el `completar` de siempre. Aquí solo está la regla de QUÉ
// OF se marcan, para que la pantalla y los tests digan lo mismo.

const PENDIENTES: ReadonlySet<OF["estado"]> = new Set(["pendiente", "en_curso"]);

/** Las OF que «Impreso» aprobaría, o [] si el botón no debe salir.
 *
 *  Sale solo si TODO lo que queda del pedido es mío o de nadie, y está sin
 *  empezar o en curso. Una OF en curso de otra persona es su trabajo, y
 *  aprobarla sería darlo por hecho en su nombre. Una en revisión o devuelta no
 *  debería existir en esta sección; si existe, alguien la está mirando y esa
 *  OF manda. */
export function ofsParaImpreso(pedido: Pedido, miId: string | null): OF[] {
  if (!miId) return [];
  const quedan = ofsQueCuentan(pedido).filter((o) => o.estado !== "aprobada");
  const todasMias = quedan.every(
    (o) => PENDIENTES.has(o.estado) && (o.autorId === null || o.autorId === miId),
  );
  return todasMias ? quedan : [];
}

/** La OF tal como queda al pulsar «Impreso»: aprobada sin revisión y, si no
 *  era de nadie, mía. Sin autor no se podría pasar el pedido (ver
 *  `puedePasarAProduccion`). `revisada` no se toca: no hubo revisión. Y el reloj
 *  se apaga: una OF aprobada no puede seguir fichando. */
export function marcarComoImpreso(of: OF, miId: string): OF {
  return { ...of, estado: "aprobada", autorId: of.autorId ?? miId, fichandoRol: null };
}

/** ¿Esconde la ficha esta acción de fila porque en la sección no revisa nadie?
 *
 *  "Pasar a revisión" (`terminar_planteo`) y "Dar por bueno sin revisión" no
 *  salen donde el único final es «Impreso», en el bloque del pedido: con ellas
 *  en la fila, la OF podía acabar en revisión en una sección sin quién la mire.
 *  En las secciones con revisión no esconde nada. */
export function accionOcultaSinRevision(
  seccion: Pick<Seccion, "sinRevision">,
  accion: AccionOF,
): boolean {
  return !!seccion.sinRevision && (accion === "terminar_planteo" || accion === "aprobar_sin_revision");
}
