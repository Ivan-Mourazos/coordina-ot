import { NextResponse } from "next/server";
import { leerPersonas, resetearPin } from "@/lib/server/personas-db";
import { exigir } from "@/lib/server/sesion";

// ─── /api/personas ───────────────────────────────────────────────────────────
// La lista de quién puede entrar (para pintar la rejilla del login) y el reseteo
// de un PIN olvidado.
//
// El GET va SIN sesión a propósito: es lo primero que se ve al abrir la web, y
// pedir sesión para ver tu propia cara sería la pescadilla. Lo que sale son
// nombres y secciones — lo mismo que ya enseñaba el tablero a cualquiera que
// entrase, y nada del PIN.

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { personas: leerPersonas() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** PATCH: un supervisor resetea el PIN de alguien.
 *
 *  Lo deja SIN PIN, y su dueño elige uno nuevo la próxima vez que entra. Un
 *  técnico no puede: resetearle el PIN a otro y entrar en su nombre es lo mismo.
 *
 *  Cualquier supervisor puede resetear el de cualquiera, incluido el de otro
 *  supervisor. Con cuatro personas en ese papel, montar una jerarquía para esto
 *  sería inventarse un problema. */
export async function PATCH(req: Request) {
  const yo = exigir(req, "supervisor");
  if (yo instanceof NextResponse) return yo;

  let id = "";
  try {
    const b: unknown = await req.json();
    if (typeof b === "object" && b !== null) {
      const v = (b as Record<string, unknown>).id;
      if (typeof v === "string") id = v.trim();
    }
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

  if (!resetearPin(id))
    return NextResponse.json({ error: "Esa persona no existe" }, { status: 404 });
  console.info(`[sesion] ${yo.id} reseteó el PIN de ${id}`);
  return NextResponse.json({ ok: true });
}
