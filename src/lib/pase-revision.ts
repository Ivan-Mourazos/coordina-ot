import { accionesDisponibles, aplicarAccion } from "./acciones";
import { ESTADO } from "./estado";
import type { OF, Pedido } from "./types";
import type { CambioOF } from "./server/overlay";
import type { SeccionId } from "./secciones";

/** El mismo motivo sirve al validar el envío y al explicar qué queda atrás. */
export function motivoNoPasaRevision(of: OF, miId: string, fichando: ReadonlySet<string>): string | null {
  if (fichando.has(of.id)) return "para primero el reloj de esta OF";
  if (of.cerradaRps) return "ya está terminada en RPS";
  if (of.detenida) return "está detenida por Producción";
  if (of.ajenaOT) return "no es trabajo de esta sección";
  if (of.autorId !== miId) return "solo puede mandarla quien la plantea";
  if (!accionesDisponibles(of, miId).some((a) => a.id === "terminar_planteo")) {
    return of.estado === "pendiente" ? "todavía no se ha empezado a plantear" : `está en «${ESTADO[of.estado].label}»`;
  }
  return null;
}

const snapshot = (of: OF): CambioOF => ({
  ofId: of.id, autorId: of.autorId, revisorId: of.revisorId,
  estado: of.estado, observacion: of.observacion ?? null, cerradaRps: of.cerradaRps ?? null,
});

/** Validar TODO antes de nombrar a nadie: una OF rechazada no deja a las demás
 *  con revisor puesto y el planteo todavía abierto. No modifica los originales. */
export function prepararPaseRevision(
  pedidos: readonly Pedido[], ofIds: readonly string[], revisorId: string,
  miId: string, fichando: ReadonlySet<string> = new Set(),
): { cambiosOF: CambioOF[]; previosOF: CambioOF[]; pendientes: string[] } {
  const ids = new Set(ofIds);
  if (!ids.size) throw new Error("No hay ninguna OF seleccionada para mandar a revisión.");
  if (!revisorId.trim()) throw new Error("Elige un compañero para revisar.");
  const todas = new Map(pedidos.flatMap((p) => p.ofs).map((of) => [of.id, of]));
  const errores: string[] = [];
  const anteriores: OF[] = [];
  for (const id of ids) {
    const of = todas.get(id);
    if (!of) { errores.push(`${id}: ya no está en este tablero`); continue; }
    const motivo = motivoNoPasaRevision(of, miId, fichando);
    if (motivo) errores.push(`${of.codigo}: ${motivo}`);
    else if (of.autorId === revisorId) errores.push(`${of.codigo}: el autor no puede revisarse su propio trabajo`);
    else anteriores.push(of);
  }
  if (errores.length) throw new Error(`No se ha mandado ninguna OF a revisión. ${errores.join("; ")}.`);
  const pendientes = pedidos.filter((p) => p.ofs.some((of) => ids.has(of.id)))
    .flatMap((p) => p.ofs)
    .filter((of) => !ids.has(of.id) && !of.ajenaOT && !of.detenida && !of.cerradaRps &&
      ["pendiente", "en_curso", "devuelta"].includes(of.estado))
    .map((of) => `${of.codigo}: ${motivoNoPasaRevision(of, miId, fichando) ?? "no se incluyó en este envío"}`);
  return {
    previosOF: anteriores.map(snapshot),
    cambiosOF: anteriores.map((of) => snapshot(aplicarAccion({ ...of, revisorId }, "terminar_planteo"))),
    pendientes,
  };
}

/** Un único POST lleva la intención completa. No se publica ningún resultado
 *  optimista: si falla la red o la validación, el tablero sigue como estaba. */
export async function solicitarPaseRevision(
  ofIds: string[], revisorId: string, operarioId: string, seccion: SeccionId,
  enviar: typeof fetch = fetch,
): Promise<{ cambiosOF: CambioOF[]; pendientes: string[] }> {
  const res = await enviar("/api/estado", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ motivo: "terminar_planteo", operarioId, seccion, pasarRevision: { ofIds, revisorId } }),
  }).catch(() => { throw new Error("No se ha podido conectar para guardar el pase a revisión. Actualiza la ficha antes de repetirlo."); });
  const datos = await res.json().catch(() => null);
  if (!res.ok) throw new Error(datos?.error ?? "No se ha podido guardar el pase a revisión. Vuelve a intentarlo.");
  if (!Array.isArray(datos?.cambiosOF)) throw new Error("No se ha podido confirmar el pase a revisión. Actualiza la ficha antes de repetirlo.");
  return datos;
}
