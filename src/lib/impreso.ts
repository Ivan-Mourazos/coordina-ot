import { ofsQueCuentan } from "./fases-tablero";
import type { OF, Pedido } from "./types";
import type { Seccion } from "./secciones";
import type { AccionOF } from "./acciones";

// ─── «Impreso»: el único gesto de Impresión Digital ──────────────────────────
// En Impresión no revisa nadie (ver `Seccion.sinRevision`): se imprime y se
// pasa. El botón aprueba las OF del pedido y luego el Board lo pasa a
// Producción con el `completar` de siempre. Aquí solo está la regla de QUÉ
// OF se marcan, para que la pantalla y los tests digan lo mismo.

// Las de revisión también: en estas secciones no hay quien revise, así que una
// OF en esos estados es un resto de cuando sí lo había. Diseño trabajó con
// revisión hasta el 26/10/2026, y sin esto sus pedidos a medio revisar se
// quedaban sin ningún botón que los sacara del tablero.
const PENDIENTES: ReadonlySet<OF["estado"]> = new Set([
  "pendiente", "en_curso", "por_revisar", "en_revision", "devuelta",
]);

/** Las OF que «Impreso» aprobaría, o [] si el botón no debe salir.
 *
 *  Sale solo si TODO lo que queda del pedido es mío o de nadie. Una OF de
 *  otra persona es su trabajo, y aprobarla sería darlo por hecho en su
 *  nombre. */
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

/** Las acciones que solo tienen sentido si alguien revisa: mandar a revisión,
 *  revisarla, aprobar, devolver, y sus marchas atrás. */
const DE_REVISION: ReadonlySet<AccionOF> = new Set<AccionOF>([
  "terminar_planteo", "empezar_revision", "aprobar", "aprobar_corregida",
  "devolver", "soltar_revision", "recuperar_planteo", "reabrir",
]);

/** ¿Esconde la ficha esta acción porque en la sección no revisa nadie?
 *
 *  Ninguna de revisión sale (Iván, 26/10/2026: «lo de revisión, elimínalo
 *  todo»): con cualquiera de ellas a mano, la OF podía acabar en una revisión
 *  que nadie hace. "Dar por bueno sin revisión" tampoco, salvo donde cada OF
 *  se finaliza en su tarjeta (`finalizar.of`, Diseño): allí ES ese botón, con
 *  otro nombre. En las secciones con revisión no esconde nada. */
export function accionOcultaSinRevision(
  seccion: Pick<Seccion, "sinRevision" | "finalizar">,
  accion: AccionOF,
): boolean {
  if (!seccion.sinRevision) return false;
  if (DE_REVISION.has(accion)) return true;
  return accion === "aprobar_sin_revision" && !seccion.finalizar?.of;
}
