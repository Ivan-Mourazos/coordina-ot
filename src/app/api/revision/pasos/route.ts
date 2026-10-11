import { NextResponse } from "next/server";
import {
  crearPasoRevision,
  editarPasoRevision,
  leerPasosRevision,
} from "@/lib/server/estado-db";
import { PASO_MAX } from "@/lib/guia-revision";
import { exigir, loginActivo } from "@/lib/server/sesion";

// ─── /api/revision/pasos ─────────────────────────────────────────────────────
// Los pasos de la guía de revisión: comunes a todos los pedidos o de una
// familia, cada uno con la causa que se marca si falla. Los mantienen los
// técnicos desde el menú, sin despliegue.
//
// Mismo criterio de acceso que /api/causas (ver su comentario largo): el autor
// es opcional y apagado no se exige identidad; encendido, leer pide sesión y
// escribir pide técnico, así que Dirección los ve y no los toca.

export const dynamic = "force-dynamic";

async function cuerpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b: unknown = await req.json();
    return typeof b === "object" && b !== null ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const noJson = () => NextResponse.json({ error: "JSON inválido" }, { status: 400 });
const entero = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);

function textoMal(t: unknown): string | null {
  if (typeof t !== "string" || t.trim().length < 3) return "El paso es demasiado corto";
  if (t.trim().length > PASO_MAX) return `El paso no puede pasar de ${PASO_MAX} caracteres`;
  return null;
}

/** GET: los pasos en servicio. Con `?todos=1`, también los retirados, que
 *  necesita el editor para poder devolverlos. */
export async function GET(req: Request) {
  if (loginActivo()) {
    const yo = exigir(req);
    if (yo instanceof NextResponse) return yo;
  }
  const todos = new URL(req.url).searchParams.get("todos") === "1";
  try {
    return NextResponse.json({ pasos: leerPasosRevision(todos) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[pasos] no se pudieron leer:", (e as Error).message);
    return NextResponse.json({ error: "No se pudieron leer los pasos" }, { status: 500 });
  }
}

/** POST: añadir un paso. `familia` null o ausente = para todos los pedidos. */
export async function POST(req: Request) {
  const b = await cuerpo(req);
  if (!b) return noJson();
  const mal = textoMal(b.texto);
  if (mal) return NextResponse.json({ error: mal }, { status: 400 });
  const causaId = entero(b.causaId);
  if (causaId === null) return NextResponse.json({ error: "Falta la causa" }, { status: 400 });

  let operarioId: string | null;
  if (loginActivo()) {
    const yo = exigir(req, "tecnico");
    if (yo instanceof NextResponse) return yo;
    operarioId = yo.id;
  } else {
    operarioId = typeof b.operarioId === "string" && b.operarioId ? b.operarioId : null;
  }

  try {
    const paso = crearPasoRevision(
      b.texto as string,
      causaId,
      typeof b.familia === "string" ? b.familia : null,
      operarioId,
    );
    if (!paso) return NextResponse.json({ error: "Esa causa no existe" }, { status: 400 });
    return NextResponse.json({ paso });
  } catch (e) {
    console.error("[pasos] no se pudo crear:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo crear el paso" }, { status: 500 });
  }
}

/** PATCH: cambiar texto, familia, causa, orden, o retirarlo. No hay DELETE:
 *  las marcas de revisión guardan el id del paso. */
export async function PATCH(req: Request) {
  const b = await cuerpo(req);
  if (!b) return noJson();
  const id = entero(b.id);
  if (id === null) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

  if (loginActivo()) {
    const yo = exigir(req, "tecnico");
    if (yo instanceof NextResponse) return yo;
  }

  if ("texto" in b) {
    const mal = textoMal(b.texto);
    if (mal) return NextResponse.json({ error: mal }, { status: 400 });
  }
  const cambios = {
    ...(typeof b.texto === "string" ? { texto: b.texto } : {}),
    ...("familia" in b ? { familia: typeof b.familia === "string" ? b.familia : null } : {}),
    ...(entero(b.causaId) !== null ? { causaId: entero(b.causaId)! } : {}),
    ...(entero(b.orden) !== null ? { orden: entero(b.orden)! } : {}),
    ...(typeof b.retirado === "boolean" ? { retirado: b.retirado } : {}),
  };
  if (Object.keys(cambios).length === 0)
    return NextResponse.json({ error: "No hay nada que cambiar" }, { status: 400 });

  try {
    const paso = editarPasoRevision(id, cambios);
    if (!paso) return NextResponse.json({ error: "Ese paso o esa causa no existen" }, { status: 404 });
    return NextResponse.json({ paso });
  } catch (e) {
    console.error("[pasos] no se pudo editar:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo cambiar el paso" }, { status: 500 });
  }
}
