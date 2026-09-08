import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { esRolAcceso, type PersonaPublica, type RolAcceso } from "../personas";
import type { SeccionId } from "../secciones";
import { getDb } from "./estado-db";

// ─── Quién puede entrar, y con qué PIN ───────────────────────────────────────
// SOLO servidor. Es el único sitio que sabe cómo se guarda un PIN; el resto de
// la aplicación pregunta "¿es este el suyo?" y recibe un sí o un no.
//
// El PIN es el de la extensión del teléfono, decidido por el equipo. Se avisó de
// que una extensión no es un secreto —la sabe toda la casa—, así que como llave
// sirve para "que no fiche otro por mí", no para probar quién revisó. Se acepta
// porque hoy no hay NADA y lo que se busca es separar quién escribe de quién
// solo mira, no blindar la web.
//
// Aun así se guarda CIFRADO: no cuesta nada y evita que en la base quede una
// lista legible de los PIN de todos, que es lo que la haría peligrosa de copiar.

/** Cuatro dígitos: es lo que tiene una extensión y es lo que sabe teclear la
 *  pantalla. Cambiarlo obliga a cambiar el teclado del login. */
export const PIN_LARGO = 4;

const PIN_RE = new RegExp(`^\\d{${PIN_LARGO}}$`);

/** scrypt con los parámetros por defecto de Node (N=16384): unos 60 ms por
 *  comprobación en el servidor. Es lento a propósito —hace inviable probar las
 *  10 000 combinaciones— y no se nota en un login que se hace una vez al día. */
function cifrar(pin: string): string {
  const sal = randomBytes(16);
  const hash = scryptSync(pin, sal, 32);
  return `scrypt$${sal.toString("base64")}$${hash.toString("base64")}`;
}

/** Comparación en tiempo CONSTANTE. Con un `===` normal, lo que tarda en
 *  responder delata cuántos bytes del hash se acertaron. */
function coincide(pin: string, guardado: string): boolean {
  const partes = guardado.split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;
  try {
    const esperado = Buffer.from(partes[2], "base64");
    const calculado = scryptSync(pin, Buffer.from(partes[1], "base64"), esperado.length);
    return timingSafeEqual(esperado, calculado);
  } catch {
    // Hash corrupto en la base: no abre. Nunca lanza, porque esto está en el
    // camino del login y un 500 aquí dejaría al equipo fuera de su herramienta.
    return false;
  }
}

interface Fila {
  id: string;
  nombre: string;
  pin_hash: string | null;
  roles: string;
  seccion: string | null;
  activo: number;
}

function aPublica(f: Fila): PersonaPublica {
  return {
    id: f.id,
    nombre: f.nombre,
    roles: f.roles.split(",").map((r) => r.trim()).filter(esRolAcceso),
    seccion: (f.seccion as SeccionId | null) ?? null,
    sinPin: f.pin_hash === null,
  };
}

/** Una persona ACTIVA, o null. Las desactivadas devuelven null a propósito:
 *  esta función decide quién entra, y una baja no entra. Para pintar su nombre
 *  en el historial no se usa esto — eso sale del registro, que guarda el id. */
export function leerPersona(id: string): PersonaPublica | null {
  const f = getDb()
    .prepare("SELECT * FROM persona WHERE id = ? AND activo = 1")
    .get(id) as Fila | undefined;
  return f ? aPublica(f) : null;
}

/** Las personas activas, opcionalmente solo las de un rol.
 *
 *  El orden es el de inserción (rowid), que es el del tablero: alfabético
 *  pondría a Ángel el primero y la rejilla del login dejaría de parecerse a la
 *  de siempre. */
export function leerPersonas(rol?: RolAcceso): PersonaPublica[] {
  const filas = getDb()
    .prepare("SELECT * FROM persona WHERE activo = 1 ORDER BY rowid")
    .all() as Fila[];
  const todas = filas.map(aPublica);
  return rol ? todas.filter((p) => p.roles.includes(rol)) : todas;
}

/** ¿Es este el PIN de esta persona? Sin PIN puesto siempre es que no: una
 *  persona a la que le acaban de resetear el PIN no debe abrir con nada. */
export function comprobarPin(id: string, pin: string): boolean {
  const f = getDb()
    .prepare("SELECT pin_hash FROM persona WHERE id = ? AND activo = 1")
    .get(id) as { pin_hash: string | null } | undefined;
  if (!f || f.pin_hash === null) return false;
  return coincide(pin, f.pin_hash);
}

/** Pone (o cambia) el PIN. `false` si no vale el formato o la persona no existe.
 *
 *  El formato se valida AQUÍ y no solo en la pantalla: por la ruta entra lo que
 *  mande cualquiera, y un PIN de tres letras dejaría a esa persona sin poder
 *  volver a entrar con el teclado numérico. */
export function ponerPin(id: string, pin: string): boolean {
  if (!PIN_RE.test(pin)) return false;
  return (
    getDb()
      .prepare("UPDATE persona SET pin_hash = ? WHERE id = ? AND activo = 1")
      .run(cifrar(pin), id).changes > 0
  );
}

/** Lo deja SIN PIN, para que lo vuelva a elegir su dueño.
 *
 *  No se restaura ningún valor por defecto: uno que supiera todo el mundo sería
 *  peor que no resetear. Quien lo pierde vuelve a teclear su extensión la
 *  siguiente vez que entra. */
export function resetearPin(id: string): boolean {
  return (
    getDb()
      .prepare("UPDATE persona SET pin_hash = NULL WHERE id = ? AND activo = 1")
      .run(id).changes > 0
  );
}
