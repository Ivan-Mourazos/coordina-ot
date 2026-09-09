import { NextResponse } from "next/server";
import { apuntarFallo, frenado, olvidarFallos } from "@/lib/server/freno";
import { comprobarPin, gastarComprobacion, leerPersona, ponerPin } from "@/lib/server/personas-db";
import { cabeceraDeSalida, cabeceraDeSesion, quienEs, secreto } from "@/lib/server/sesion";

// ─── /api/sesion ─────────────────────────────────────────────────────────────
// Entrar, salir y saber quién eres. Los tres verbos en un fichero, como hace
// /api/fichaje: son la misma cosa vista de tres maneras.
//
// El PIN entra por aquí y NO sale nunca: ni en la respuesta, ni en un log, ni
// en un mensaje de error.

export const dynamic = "force-dynamic";

/** La MISMA respuesta para un PIN equivocado y para un nombre que no existe.
 *
 *  Distinguirlos regala media respuesta: sabiendo qué ids valen, solo queda
 *  probar cuatro dígitos. */
const noEsCorrecto = () => NextResponse.json({ error: "No es correcto" }, { status: 401 });

/** GET: quién eres. Lo pide el tablero al arrancar, antes de pintar nada. */
export async function GET(req: Request) {
  return NextResponse.json(
    { yo: quienEs(req) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** POST: entrar.
 *
 *  Con `pinRepetido` cuando la persona todavía no tiene PIN: lo elige ahí
 *  mismo, tecleándolo dos veces. Una errata en un alta de un solo intento la
 *  dejaría fuera de su herramienta de trabajo hasta que alguien se lo resetee. */
export async function POST(req: Request) {
  // Comprobar el secreto YA, antes de tocar nada del cuerpo. instrumentation.ts
  // ya impide arrancar así con el login encendido, pero esta ruta no depende
  // de haber pasado por `register()` para correr —un test, una instancia que
  // lo saltara— y sin este corte el fallo llegaría DESPUÉS de `ponerPin`: la
  // persona vería su PIN guardado y la petición reventando igual, y reintentar
  // no arreglaría nada porque ya no habría PIN que volver a elegir.
  try {
    secreto();
  } catch (e) {
    console.error("[sesion] no se puede entrar:", (e as Error).message);
    // Sin el motivo real —eso no se le enseña a nadie por la pantalla—, pero
    // distinto de "No es correcto": esto no es un PIN equivocado, es que el
    // servidor no puede firmar nada. "Reintenta" no ayuda; avisar sí.
    return NextResponse.json(
      { error: "Algo va mal en el servidor. Avisa a Iván." },
      { status: 500 },
    );
  }

  let b: Record<string, unknown>;
  try {
    const crudo: unknown = await req.json();
    if (typeof crudo !== "object" || crudo === null) throw new Error("no es objeto");
    b = crudo as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const id = typeof b.id === "string" ? b.id.trim() : "";
  const pin = typeof b.pin === "string" ? b.pin : "";
  if (!id || !pin) return noEsCorrecto();

  if (frenado(id))
    return NextResponse.json(
      { error: "Demasiados intentos. Espera un minuto." },
      { status: 429 },
    );

  const persona = leerPersona(id);
  if (!persona) {
    // El cuerpo de la respuesta es igual que el de un PIN equivocado, pero sin
    // esto NO tardaría lo mismo: un PIN equivocado pasa por scrypt (~60 ms) y
    // un id inexistente respondería casi al instante, y ese tiempo delataría
    // qué ids son reales aunque el JSON sea idéntico. `gastarComprobacion`
    // hace el mismo trabajo de scrypt y lo tira, para igualar los dos caminos.
    gastarComprobacion();
    // Se apunta el fallo igual que si existiera: si no, el TOPE_FALLOS
    // también diría qué ids son reales.
    apuntarFallo(id);
    return noEsCorrecto();
  }

  if (persona.sinPin) {
    const repetido = typeof b.pinRepetido === "string" ? b.pinRepetido : null;
    if (repetido === null) {
      // La pantalla ya sabe por la rejilla (GET /api/personas → sinPin) que hay
      // que pedirlo dos veces, así que esto no debería pasar desde la app real.
      // Si pasa, se trata como un intento cualquiera: no hay un tercer estado
      // que distinga "te falta un campo" de "no es correcto", porque eso
      // también regalaría qué ids no tienen PIN todavía.
      apuntarFallo(id);
      return noEsCorrecto();
    }
    if (repetido !== pin)
      return NextResponse.json({ error: "Los dos PIN no coinciden" }, { status: 400 });
    if (!ponerPin(id, pin))
      return NextResponse.json({ error: "El PIN son cuatro números" }, { status: 400 });
  } else if (!comprobarPin(id, pin)) {
    apuntarFallo(id);
    return noEsCorrecto();
  }

  olvidarFallos(id);
  const yo = leerPersona(id)!;
  return NextResponse.json(
    { yo: { id: yo.id, nombre: yo.nombre, roles: yo.roles } },
    { headers: { "Set-Cookie": cabeceraDeSesion(id), "Cache-Control": "no-store" } },
  );
}

/** DELETE: salir. No comprueba nada —salir sin sesión no es un error— y siempre
 *  manda la cookie caducada: si el navegador tenía una rota, así se la quita.
 *
 *  El parámetro no se usa: está para que la firma coincida con la de un route
 *  handler de verdad (Next.js siempre llama con la Request) y con cómo la
 *  invocan los tests. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function DELETE(_req: Request) {
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": cabeceraDeSalida() } });
}
