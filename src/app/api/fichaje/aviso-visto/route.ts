import { NextResponse } from "next/server";
import { marcarAvisoCierreVisto } from "@/lib/server/fichaje-db";

// ─── /api/fichaje/aviso-visto ────────────────────────────────────────────────
// Acuse de "ya he visto que mi fichaje se cerró solo". Existe porque antes el
// aviso se borraba al leerlo, y así se podía perder: bastaba con que la
// respuesta no llegara, o con que otra pestaña la pidiera primero, para que el
// técnico nunca se enterase — que es justo lo que el aviso venía a evitar.
// Ahora GET /api/fichaje lo devuelve tantas veces como haga falta y solo
// desaparece cuando el cliente confirma desde aquí que lo ha enseñado.

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

  marcarAvisoCierreVisto(operarioId);
  return NextResponse.json({ ok: true });
}
