import { NextResponse } from "next/server";
import {
  leerAccionesDesde,
  leerAvisosVistos,
  marcarAvisosVistos,
} from "@/lib/server/estado-db";
import { avisosPara, VENTANA_AVISOS_DIAS } from "@/lib/avisos";

// ─── /api/avisos ─────────────────────────────────────────────────────────────
// Los avisos de "te han movido el trabajo". Se derivan del registro de
// acciones, no del estado de la OF: un cambio de manos no deja marca en ella.
// Devuelve ids crudos (operario, OF); el texto lo compone el cliente, que ya
// tiene los nombres y los pedidos en memoria — así el servidor no tiene que
// cargar el tablero, que contra RPS tarda 7-15 s.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const operarioId = new URL(req.url).searchParams.get("operarioId");
  if (!operarioId)
    return NextResponse.json({ error: "Falta operarioId" }, { status: 400 });

  const desde = new Date(Date.now() - VENTANA_AVISOS_DIAS * 86_400_000).toISOString();
  const avisos = avisosPara(
    leerAccionesDesde(desde),
    operarioId,
    leerAvisosVistos(operarioId),
  );
  return NextResponse.json({ avisos }, { headers: { "Cache-Control": "no-store" } });
}

interface Body {
  operarioId?: unknown;
  claves?: unknown;
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

  const claves = body.claves;
  if (!Array.isArray(claves) || !claves.every((x) => typeof x === "string" && x.length > 0))
    return NextResponse.json({ error: "claves inválido" }, { status: 400 });

  marcarAvisosVistos(operarioId, claves as string[]);
  return NextResponse.json({ ok: true });
}
