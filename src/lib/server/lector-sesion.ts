import { lectorDe, type Lector } from "./lector-notas";
import { leerPersona } from "./personas-db";
import { loginActivo, quienEs } from "./sesion";

/** El lector de notas de esta petición, o null con el login apagado (o sin
 *  sesión válida): entonces no hay filtro de audiencia, como hasta ahora.
 *
 *  La sección se relee de la persona —la sesión solo trae id y roles— para
 *  que un cambio de sección se note en el acto. Aparte de lector-notas.ts para
 *  que aquel siga siendo puro (lo usan los tests sin sesión ni BD). */
export function lectorDePeticion(req: Request): Lector | null {
  if (!loginActivo()) return null;
  const yo = quienEs(req);
  if (!yo) return null;
  const p = leerPersona(yo.id);
  return lectorDe({ id: yo.id, roles: yo.roles, seccion: p?.seccion ?? null });
}
