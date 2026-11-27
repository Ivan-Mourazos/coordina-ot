import { NextResponse } from "next/server";
import { guardarCorreccionHecha } from "@/lib/server/estado-db";
import { identidad } from "@/lib/server/sesion";

// ─── /api/revision/correccion ────────────────────────────────────────────────
// Lo que el AUTOR lleva marcado como corregido en «Qué corregir» (fase 2 de la
// vista del autor, 27/11/2026). Antes iba en el navegador y se perdía al
// cambiar de PC o si un compañero cogía la OF.
//
// SOLO INFORMATIVO (Iván, 27/11/2026): marcarlo todo no es requisito para
// pasar a revisión ni para nada más. Esto solo guarda la lista.
//
// Lo que se manda llega con la OF en /api/estado (`OF.devolucion.hechas`): aquí
// no hay GET.

export const dynamic = "force-dynamic";

/** Tope de casillas: una nota con más puntos que esto no es una lista. */
const MAX_PUNTOS = 100;

/** PUT { ofId, hechas: number[] } → sustituye lo marcado de esa OF. */
export async function PUT(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const ofId = typeof b.ofId === "string" && b.ofId.trim() ? b.ofId : null;
  const hechas = Array.isArray(b.hechas)
    ? [...new Set(b.hechas.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < MAX_PUNTOS))]
    : null;
  if (!ofId || !hechas) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });

  // Quién marca lo decide identidad(), no el cuerpo (con el login encendido).
  const yo = identidad(req, b.operarioId, "tecnico");
  if (yo instanceof NextResponse) return yo;

  try {
    const r = guardarCorreccionHecha(ofId, hechas, yo.id);
    if (r === "no_autor")
      return NextResponse.json({ error: "Solo el autor de la OF marca lo corregido" }, { status: 403 });
    if (r === "sin_correccion")
      return NextResponse.json({ error: "Esta OF no tiene nada que corregir" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[correccion] no se pudo guardar:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
}
