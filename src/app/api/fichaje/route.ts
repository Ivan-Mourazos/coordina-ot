import { NextResponse } from "next/server";
import { leerFichaje, guardarFichaje } from "@/lib/server/fichaje-db";
import { fichar, pausar } from "@/lib/fichaje";
import type { Rol } from "@/lib/types";

// ─── /api/fichaje ────────────────────────────────────────────────────────────
// El cliente manda la INTENCIÓN (qué OFs deja corriendo y con qué rol); el
// server aplica el motor con SU hora y persiste. Así todos los tiempos salen
// del mismo reloj. Sin login: se confía en el operarioId que manda el cliente
// (modelo "sin login" del proyecto; la verdad oficial será RPS en la fase 2b).

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

  const operarioId = body.operarioId;
  if (typeof operarioId !== "string" || operarioId.length === 0)
    return NextResponse.json({ error: "Falta operarioId" }, { status: 400 });

  const ofIds = body.ofIds;
  if (!Array.isArray(ofIds) || !ofIds.every((x) => typeof x === "string"))
    return NextResponse.json({ error: "ofIds inválido" }, { status: 400 });

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
  return NextResponse.json({ fichaje: nuevo });
}

export async function GET(req: Request) {
  const operarioId = new URL(req.url).searchParams.get("operarioId");
  if (!operarioId)
    return NextResponse.json({ error: "Falta operarioId" }, { status: 400 });
  return NextResponse.json(
    { fichaje: leerFichaje(operarioId) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
