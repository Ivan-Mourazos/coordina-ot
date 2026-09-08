import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { RolAcceso } from "../personas";
import { leerPersona } from "./personas-db";

// ─── La sesión ───────────────────────────────────────────────────────────────
// Una cookie FIRMADA con el id de quien entró. Firmada y no cifrada: el id no
// es un secreto (sale en el tablero), lo que hace falta es que nadie pueda
// ponerse otro.
//
// httpOnly porque sin ella el JavaScript de la propia página puede leerla y
// cambiarla desde la consola del navegador, que es exactamente el agujero que
// esto viene a cerrar.
//
// SIN CADUCIDAD, por decisión del equipo: se entra una vez y ese navegador
// recuerda hasta pulsar Salir. Caducar cada día son cuatro dígitos más por
// persona y mañana; caducar por inactividad echa a quien lleva dos horas
// planteando un toldo sin tocar la web, que es cuando más molesta.
//
// La sesión se lee de la CABECERA de la Request y no de next/headers a
// propósito: así las rutas se pueden probar con una Request a pelo, como ya
// hacen los tests de /api/fases.

export const COOKIE = "coordina_sesion";

/** Un año. No es caducidad de sesión —eso no lo hay— sino el tope que impone el
 *  navegador a cualquier cookie: sin Max-Age se borraría al cerrarlo, y el
 *  equipo tendría que volver a entrar cada mañana. */
const MAX_AGE = 60 * 60 * 24 * 365;

function secreto(): string {
  const v = process.env.COORDINA_SESION_SECRET;
  if (!v)
    throw new Error(
      "Falta COORDINA_SESION_SECRET en .env.local (copia .env.example). Sin secreto " +
        "la cookie de sesión se puede falsificar y el login no serviría de nada.",
    );
  return v;
}

const firma = (payload: string): string =>
  createHmac("sha256", secreto()).update(payload).digest("base64url");

/** El valor de la cookie: id, cuándo se emitió y la firma de las dos cosas.
 *
 *  La marca de tiempo no se usa para caducar. Está para que dos entradas
 *  seguidas de la misma persona den cookies distintas, y para poder añadir
 *  caducidad más adelante sin cambiar el formato. */
export function firmarSesion(id: string): string {
  const payload = `${id}.${Date.now()}`;
  return `${payload}.${firma(payload)}`;
}

export interface Sesion {
  id: string;
  nombre: string;
  roles: RolAcceso[];
}

/** Saca la cookie de la cabecera. El navegador las manda todas en una línea
 *  separadas por "; ", así que hay que buscar la nuestra, no leer la primera. */
function galleta(req: Request): string | null {
  const crudo = req.headers.get("cookie");
  if (!crudo) return null;
  for (const trozo of crudo.split(";")) {
    const i = trozo.indexOf("=");
    if (i < 0) continue;
    if (trozo.slice(0, i).trim() === COOKIE) return trozo.slice(i + 1).trim();
  }
  return null;
}

/** Quién manda esta petición, o null.
 *
 *  La persona se RELEE de la base cada vez en lugar de fiarse de lo que diga la
 *  cookie. Cuesta una lectura de SQLite y a cambio desactivar a alguien le
 *  corta el paso en el acto, sin esperar a que cierre sesión, y un cambio de
 *  rol se nota igual de rápido. */
export function quienEs(req: Request): Sesion | null {
  const valor = galleta(req);
  if (!valor) return null;

  const corte = valor.lastIndexOf(".");
  if (corte < 0) return null;
  const payload = valor.slice(0, corte);
  const mandada = valor.slice(corte + 1);

  // Comparación en tiempo constante: con un === normal, lo que tarda en
  // responder delata cuántos caracteres de la firma se acertaron.
  let esperada: string;
  try {
    esperada = firma(payload);
  } catch {
    // Sin secreto configurado no hay sesión válida posible. No se lanza aquí
    // porque esto corre en CADA petición: el que revienta es el que firma.
    return null;
  }
  const a = Buffer.from(mandada);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const id = payload.slice(0, payload.lastIndexOf("."));
  const persona = leerPersona(id);
  if (!persona) return null;
  return { id: persona.id, nombre: persona.nombre, roles: persona.roles };
}

/** La sesión, o la respuesta con la que hay que cortar. **Con el login
 *  ENCENDIDO**: es lo que llama `identidad()`, y lo llaman directamente solo las
 *  rutas que no pueden sacar identidad de ningún otro sitio (las lecturas y
 *  pedido-scan), siempre dentro de un `if (loginActivo())`.
 *
 *  Las rutas de escritura llaman a `identidad()`, no a esto: una ruta que llame
 *  aquí a secas se queda muerta con el login apagado, que es como se despliega.
 *
 *  UNA sola función para las once: repetir la comprobación en cada una
 *  garantiza que a la doceava se le olvide.
 */
export function exigir(req: Request, rol?: RolAcceso): Sesion | NextResponse {
  const yo = quienEs(req);
  if (!yo)
    return NextResponse.json(
      { error: "Hay que entrar para hacer esto" },
      { status: 401 },
    );
  if (rol && !yo.roles.includes(rol))
    return NextResponse.json(
      { error: "Esta cuenta es de solo lectura" },
      { status: 403 },
    );
  return yo;
}

// ── El interruptor ──────────────────────────────────────────────────────────
// El login se despliega APAGADO y se enciende cambiando una variable en el
// servidor, como ya se hace con el fichaje (FICHAJE_OLANET). Sirve para
// encenderlo contra el servidor de verdad, mirar, y apagarlo en un minuto si
// molesta, sin volver a desplegar.
//
// Con el login apagado el servidor sigue creyéndose el operarioId del cuerpo,
// igual que hoy: NO protege nada. El agujero se cierra el día que se enciende.

/** Comparación exacta contra "activo": cualquier otra cosa —vacío, "true", un
 *  typo— deja el login apagado. Un interruptor de seguridad que se encienda por
 *  accidente no es un interruptor. */
export function loginActivo(): boolean {
  return process.env.COORDINA_LOGIN === "activo";
}

/** Quién manda esta petición, con el interruptor de por medio. **Es lo que
 *  llaman las rutas**, no `exigir`.
 *
 *  - Encendido: la sesión y solo la sesión. `delCuerpo` se ignora.
 *  - Apagado: la sesión si la hay —para que encender, mirar y apagar no eche a
 *    quien ya entró— y si no, el `operarioId` del cuerpo, como hasta ahora.
 *
 *  El ROL se hace cumplir en los dos casos. Si solo se comprobara con el login
 *  encendido, encenderlo cambiaría quién puede hacer qué, y eso es justo lo que
 *  no se quiere descubrir el día de encenderlo.
 *
 *  Apagado, un id que no existe (o que no es una persona activa) da 400 y no
 *  pasa: hoy el servidor no comprueba nada, pero firmar una acción a nombre de
 *  alguien que no está deja un registro apuntando a la nada. */
export function identidad(
  req: Request,
  delCuerpo: unknown,
  rol?: RolAcceso,
): Sesion | NextResponse {
  if (loginActivo()) return exigir(req, rol);

  const yo =
    quienEs(req) ??
    (typeof delCuerpo === "string" && delCuerpo.length > 0
      ? (() => {
          const p = leerPersona(delCuerpo);
          return p ? { id: p.id, nombre: p.nombre, roles: p.roles } : null;
        })()
      : null);

  if (!yo) return NextResponse.json({ error: "Falta operarioId" }, { status: 400 });
  if (rol && !yo.roles.includes(rol))
    return NextResponse.json({ error: "Esta cuenta es de solo lectura" }, { status: 403 });
  return yo;
}

/** El Set-Cookie de entrar.
 *
 *  Sin Secure: la web va por HTTP en la red interna (192.168.0.90:4300) y con
 *  Secure el navegador no guardaría la cookie — nadie podría entrar. Ponerlo el
 *  día que haya HTTPS.
 *
 *  SameSite=Lax basta: no hay ningún sitio externo que enlace aquí, y Strict
 *  rompería la vuelta desde las otras herramientas del menú. */
export function cabeceraDeSesion(id: string): string {
  return `${COOKIE}=${firmarSesion(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

/** El Set-Cookie de salir: la misma cookie, vacía y ya caducada. */
export function cabeceraDeSalida(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
