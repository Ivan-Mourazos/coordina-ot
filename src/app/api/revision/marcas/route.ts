import { NextResponse } from "next/server";
import { leerMarcasRevision, marcarPuntoRevision } from "@/lib/server/estado-db";

// ─── /api/revision/marcas ────────────────────────────────────────────────────
// Lo que el revisor lleva comprobado de cada OF, punto por punto.
//
// Se guarda en el servidor y no en el navegador porque de ello depende poder
// aprobar: con las marcas solo en la pantalla, un refresco a media revisión
// obligaría a repasar los ocho puntos otra vez para poder seguir. Y porque la
// revisión de una OF es una sola aunque se mire desde dos sitios (el panel de
// Revisiones y la ficha del pedido).
//
// Sin login, como el resto: el `operarioId` lo manda el navegador y aquí solo
// sirve para dejar apuntado quién comprobó qué.

export const dynamic = "force-dynamic";

/** GET ?ofIds=a,b,c → { marcas: { ofId: { puntoId: "bien" | "falla" } } } */
export async function GET(req: Request) {
  const crudo = new URL(req.url).searchParams.get("ofIds") ?? "";
  const ofIds = crudo.split(",").map((s) => s.trim()).filter(Boolean);
  if (ofIds.length === 0) return NextResponse.json({ marcas: {} });

  try {
    return NextResponse.json(
      { marcas: leerMarcasRevision(ofIds) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[revision] no se pudieron leer las marcas:", (e as Error).message);
    return NextResponse.json({ error: "No se pudieron leer" }, { status: 500 });
  }
}

/** PUT: marca un punto en varias OF a la vez. `estado: null` lo desmarca.
 *
 *  Varias OF porque la guía es del PEDIDO: el revisor mira el trabajo entero y
 *  marca una sola lista aunque el pedido traiga cuatro OF. */
export async function PUT(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const ofIds = Array.isArray(b.ofIds) ? b.ofIds.filter((x): x is string => typeof x === "string") : [];
  const puntoId = typeof b.puntoId === "number" && Number.isInteger(b.puntoId) ? b.puntoId : null;
  const estado =
    b.estado === null || b.estado === "bien" || b.estado === "falla" ? b.estado : undefined;

  if (ofIds.length === 0 || puntoId === null || estado === undefined)
    return NextResponse.json({ error: "Faltan datos o el estado no vale" }, { status: 400 });

  const operarioId = typeof b.operarioId === "string" && b.operarioId ? b.operarioId : null;
  try {
    marcarPuntoRevision(ofIds, puntoId, estado, operarioId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[revision] no se pudo marcar:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
}
