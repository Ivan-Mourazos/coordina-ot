import { NextResponse } from "next/server";
import { registrarLatido } from "@/lib/server/fichaje-db";

// ─── /api/fichaje/latido ─────────────────────────────────────────────────────
// Aviso de "la pestaña sigue viva" mientras hay un fichaje corriendo. El
// cliente lo llama cada 60 s (ver el efecto de latido en Board.tsx) y se para
// al pausar o cerrar la pestaña — que es justo lo que se quiere detectar: si
// deja de llegar, cerrarFichajesSinLatido() (server/olanet-worker.ts) cierra
// el intervalo abierto con la hora de ESTE último aviso, no con la hora en
// que se dio cuenta. Tiene que ser barato: se llama una vez por minuto y por
// persona, así que solo hace un upsert de una fila.

export const dynamic = "force-dynamic";

interface Body {
  operarioId?: unknown;
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

  registrarLatido(operarioId, new Date().toISOString());
  return NextResponse.json({ ok: true });
}
