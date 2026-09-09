import { NextResponse } from "next/server";
// `marcarAvisoCierreVisto` no se llama desde aquí: el acuse del aviso tiene su
// propia ruta (POST /api/fichaje/aviso-visto), porque leerlo y darlo por visto
// son dos momentos distintos — ver el comentario del GET de más abajo.
import { leerFichaje, guardarFichaje, leerAvisoCierre } from "@/lib/server/fichaje-db";
import { encolarFichaje } from "@/lib/server/olanet-outbox";
import { fichar, pausar } from "@/lib/fichaje";
import { identidad } from "@/lib/server/sesion";
import type { Rol } from "@/lib/types";

// ─── /api/fichaje ────────────────────────────────────────────────────────────
// El cliente manda la INTENCIÓN (qué OFs deja corriendo y con qué rol); el
// server aplica el motor con SU hora y persiste. Así todos los tiempos salen
// del mismo reloj. La identidad de quien ficha la decide identidad(): con el
// login encendido sale de la sesión; apagado, sigue siendo el operarioId que
// manda el cliente, como hasta ahora.

export const dynamic = "force-dynamic";

interface Body {
  operarioId?: unknown;
  ofIds?: unknown;
  rol?: unknown;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  // Un body JSON que no sea objeto (p.ej. el literal `null`) parsea sin error:
  // sin esta guarda, leer body.operarioId reventaría con un 500 en vez de 400.
  if (typeof body !== "object" || body === null)
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

  const ofIds = body.ofIds;
  if (!Array.isArray(ofIds) || !ofIds.every((x) => typeof x === "string"))
    return NextResponse.json({ error: "ofIds inválido" }, { status: 400 });

  // Quién ficha lo decide identidad(), no el cuerpo: fichar en nombre de otro
  // es exactamente el agujero que esta tarea cierra.
  const yo = identidad(req, body.operarioId, "tecnico");
  if (yo instanceof NextResponse) return yo;
  const operarioId = yo.id;

  const ahora = new Date().toISOString();
  const actual = leerFichaje(operarioId);

  let nuevo;
  if (ofIds.length === 0) {
    nuevo = pausar(actual, ahora);
  } else if (body.rol === "plantear" || body.rol === "revisar") {
    nuevo = fichar(actual, ofIds as string[], body.rol as Rol, operarioId, ahora);
  } else {
    return NextResponse.json({ error: "rol inválido" }, { status: 400 });
  }

  guardarFichaje(operarioId, nuevo);
  // El fichaje pasa a la cola de salida hacia OLANET: líneas de tiempo de los
  // intervalos ya cerrados, y movimientos de fase de todos (un intervalo
  // abierto ya genera su "iniciada"). encolarFichaje no lanza a propósito: que
  // la cola falle no puede impedir que alguien fiche, y los intervalos quedan
  // guardados igual para reintentarlo.
  encolarFichaje(operarioId, nuevo.intervalos);
  return NextResponse.json({ fichaje: nuevo });
}

export async function GET(req: Request) {
  // El parámetro de la URL se conserva: apagado es de donde sale la
  // identidad, igual que en el POST.
  const yo = identidad(req, new URL(req.url).searchParams.get("operarioId"), "tecnico");
  if (yo instanceof NextResponse) return yo;
  // avisoCierre: si el latido dejó de llegar y cerrarFichajesSinLatido()
  // cerró un intervalo suyo mientras no miraba, se entera aquí, al cargar.
  // NO se borra al leerlo: sigue viniendo hasta que el cliente confirme que lo
  // ha enseñado (POST /api/fichaje/aviso-visto). Antes se consumía aquí, y
  // bastaba con que la respuesta se perdiera para que el aviso desapareciera
  // sin que nadie lo viera.
  return NextResponse.json(
    { fichaje: leerFichaje(yo.id), avisoCierre: leerAvisoCierre(yo.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
