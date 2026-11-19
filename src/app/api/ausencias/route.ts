import { NextResponse } from "next/server";
import { validarAusencias } from "@/lib/visita";
import { guardarMisAusencias, leerMisAusencias } from "@/lib/server/visitas-db";
import { identidad } from "@/lib/server/sesion";

// ─── /api/ausencias ─────────────────────────────────────────────────────────
// Las de quien pregunta, y solo las suyas: la nota de una ausencia es privada.

export const dynamic = "force-dynamic";

// Fecha local (no UTC): pasada la medianoche en Madrid sigue siendo «ayer» en UTC.
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function GET(req: Request) {
  const yo = identidad(req, new URL(req.url).searchParams.get("operarioId"));
  if (yo instanceof NextResponse) return yo;
  return NextResponse.json(leerMisAusencias(yo.id), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  let b: Record<string, unknown>;
  try {
    const v: unknown = await req.json();
    if (typeof v !== "object" || v === null) throw new Error();
    b = v as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const yo = identidad(req, b.operarioId);
  if (yo instanceof NextResponse) return yo;
  const a = validarAusencias(b);
  if (!a) return NextResponse.json({ error: "Revisa los días: alguna fecha no vale" }, { status: 400 });
  guardarMisAusencias(yo.id, a, hoy());
  return NextResponse.json({ ok: true });
}
