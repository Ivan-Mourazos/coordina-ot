import { NextResponse } from "next/server";
import { normalizarFiltrosPublicos } from "@/lib/publico";
import { leerPaginaPublica } from "@/lib/server/publico-db";

// ─── GET /api/publico/pedidos ────────────────────────────────────────────────
// La lista que ve quien NO tiene sesión: pendientes o realizados, de toda la
// casa. Sale del índice en memoria del Historial, así que filtrar son
// milisegundos; lo único que toca RPS es el detalle de las 40 filas.
//
// ESTA RUTA ES PÚBLICA A PROPÓSITO y es la única de su clase junto a las otras
// dos de `publico/`. Lo que decide qué se puede enseñar está en lib/publico.ts
// y en publico-db.ts: aquí no se añade ni un campo más.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const filtros = normalizarFiltrosPublicos(new URL(req.url).searchParams);
  try {
    const pagina = await leerPaginaPublica(filtros);
    return NextResponse.json(pagina, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[publico] lista falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudieron cargar los pedidos" }, { status: 500 });
  }
}
