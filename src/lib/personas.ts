import type { SeccionId } from "./secciones";

// ─── Quién puede entrar, y a qué ─────────────────────────────────────────────
// Vive FUERA de lib/server para que lo pueda importar el navegador: la pantalla
// del login y la cabecera necesitan el tipo, y arrastrar el módulo de la base
// hasta el cliente metería better-sqlite3 en el bundle.
//
// OJO: `Rol` (lib/types.ts) es otra cosa —plantear o revisar, lo que se hace en
// una OF—. Esto es a qué tiene acceso una persona. Se llaman distinto a
// propósito: son dos ejes que no se cruzan.

/** Roles ACUMULABLES, no uno por persona: Ángel revisa Y supervisa, así que
 *  lleva los dos. De ahí que una persona tenga una lista y no un valor. */
export type RolAcceso = "tecnico" | "supervisor";

export const ROLES_ACCESO: readonly RolAcceso[] = ["tecnico", "supervisor"];

export function esRolAcceso(v: unknown): v is RolAcceso {
  return v === "tecnico" || v === "supervisor";
}

/** Lo que se puede contar de una persona sin comprometer nada.
 *
 *  El hash del PIN NO está aquí, y no es un olvido: este objeto viaja al
 *  navegador (la rejilla del login lo necesita para pintar los nombres) y lo
 *  único que hace falta saber del PIN es si lo tiene puesto o no. */
export interface PersonaPublica {
  id: string;
  nombre: string;
  roles: RolAcceso[];
  /** Solo la usan los técnicos: de ella sale su lista de trabajo. */
  seccion: SeccionId | null;
  /** Todavía no ha elegido PIN (recién dada de alta, o se lo resetearon). La
   *  pantalla lo pide DOS veces en ese caso, en vez de una. */
  sinPin: boolean;
}
