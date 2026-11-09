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
 *  lleva los dos. De ahí que una persona tenga una lista y no un valor.
 *
 *  · `tecnico`: trabaja — plantea, revisa, ficha, escribe notas.
 *  · `supervisor`: resetea el PIN de otro. Nada más.
 *  · `direccion`: entra y lo ve todo, sin escribir. Separado de `supervisor`
 *    a propósito: mirar todo no es arreglar cuentas, y un PIN reseteado por
 *    error deja a un técnico fuera.
 *  · `produccion`: la oficina de Producción (Belén, 09/11/2026). Entra a SU
 *    pantalla —buscar pedidos y ver cómo van en fábrica— y no al tablero de
 *    OT. Sin `tecnico`, el servidor ya le niega cualquier escritura. */
export type RolAcceso = "tecnico" | "supervisor" | "direccion" | "produccion";

export const ROLES_ACCESO: readonly RolAcceso[] = ["tecnico", "supervisor", "direccion", "produccion"];

export function esRolAcceso(v: unknown): v is RolAcceso {
  return v === "tecnico" || v === "supervisor" || v === "direccion" || v === "produccion";
}

/** Notas del pedido: las escriben los técnicos y, para hablar con OT,
 *  Producción (Belén, 10/11/2026). Dirección solo mira. */
export function puedeEscribirNotas(roles: readonly RolAcceso[]): boolean {
  return roles.includes("tecnico") || roles.includes("produccion");
}

/** ¿Ve también las notas «solo OT»? El equipo y Dirección, sí; Producción
 *  solo las «para todos» y las suyas. */
export function veNotasInternas(roles: readonly RolAcceso[]): boolean {
  return roles.includes("tecnico") || roles.includes("direccion") || roles.includes("supervisor");
}

/** Pantallas hechas a medida de una persona de Producción. Son POR PERSONA y
 *  no por rol (Iván, 09/11/2026): cada compañero de Producción tendrá la suya,
 *  distinta de la de Belén. El rol `produccion` solo dice que entra por aquí. */
export type VistaAMedida = "belen";

const VISTAS_A_MEDIDA: Readonly<Record<string, VistaAMedida>> = {
  "belen-alamancos": "belen",
};

/** La pantalla a medida en la que aterriza esta persona, o null si va a lo de
 *  siempre. Quien tenga `tecnico` o `direccion` sigue entrando a lo suyo
 *  aunque lleve `produccion`. Alguien de Producción sin pantalla propia todavía
 *  ve la consulta de solo lectura, como quien no ha entrado. */
export function vistaAMedida(p: { id: string; roles: readonly RolAcceso[] }): VistaAMedida | null {
  if (!p.roles.includes("produccion") || p.roles.includes("tecnico") || p.roles.includes("direccion")) return null;
  return VISTAS_A_MEDIDA[p.id] ?? null;
}

/** ¿Se pinta la web sin controles de escribir? Sin `tecnico`, siempre: el
 *  servidor ya le contesta 403 a cualquier escritura. Con `tecnico`, solo si
 *  además tiene `direccion` y ha encendido «Ver como Dirección», que es para
 *  mirar lo que ven ellos sin cambiar de cuenta — su cuenta sigue pudiendo
 *  escribir en el servidor. */
export function esSoloLectura(roles: readonly RolAcceso[], verComoDireccion: boolean): boolean {
  if (!roles.includes("tecnico")) return true;
  return verComoDireccion && roles.includes("direccion");
}

/** Quién ve el interruptor «Ver como Dirección»: quien puede trabajar Y mirar
 *  como Dirección. Hoy solo Iván, mientras se desarrolla. */
export function puedeVerComoDireccion(roles: readonly RolAcceso[]): boolean {
  return roles.includes("tecnico") && roles.includes("direccion");
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
  /** Nombre y primer apellido, para la pantalla de entrar: con nombres de
   *  pila solos, dos personas iguales (hay dos Belén en Producción) no se
   *  distinguen. Solo se enseña ahí; el resto de la web usa `nombre`. */
  nombreCompleto: string;
}
