import { NextResponse } from "next/server";
import { esColorElegible } from "@/lib/color-persona";
import { ponerColor } from "@/lib/server/personas-db";
import { identidad } from "@/lib/server/sesion";

// ─── /api/personas/color ─────────────────────────────────────────────────────
// Cada uno elige el color de SU cara (Iván, 17/11/2026). Sin rol: también
// Dirección (solo lectura) y Producción, porque esto no toca ningún pedido.
// Solo el tuyo: el id sale de la sesión, no del cuerpo (con el login apagado,
// `identidad` se fía del cuerpo, como en el resto de rutas).

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  let body: Record<string, unknown>;
  try {
    const b: unknown = await req.json();
    if (typeof b !== "object" || b === null) throw new Error();
    body = b as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const yo = identidad(req, body.operarioId);
  if (yo instanceof NextResponse) return yo;

  const color = body.color === null ? null : body.color;
  if (color !== null && !esColorElegible(color))
    return NextResponse.json({ error: "Ese color no está en la paleta" }, { status: 400 });

  if (!ponerColor(yo.id, color))
    return NextResponse.json({ error: "Esa persona no existe" }, { status: 404 });
  return NextResponse.json({ ok: true, color });
}
