import { NextResponse } from "next/server";
import { normalizarFiltrosConsulta } from "@/lib/consulta";
import { ListaEnConstruccion, leerPaginaConsulta } from "@/lib/server/publico-db";

// ─── GET /api/publico/pedidos ────────────────────────────────────────────────
// La lista que ve quien NO tiene sesión: todos los pedidos de la casa con OF,
// filtrados por estado, paso, familia, fechas y búsqueda. Sale del índice en
// memoria, así que filtrar son milisegundos; lo único que va a RPS y a OLANET
// es dónde está cada fila que está en fábrica.
//
// ESTA RUTA ES PÚBLICA A PROPÓSITO y es la única de su clase junto a las otras
// dos de `publico/`. Lo que decide qué se puede enseñar está en lib/consulta.ts
// y en publico-db.ts: aquí no se añade ni un campo más.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const filtros = normalizarFiltrosConsulta(new URL(req.url).searchParams);
  try {
    const pagina = await leerPaginaConsulta(filtros);
    return NextResponse.json(pagina, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // «Todavía no» no es «se rompió». El índice tarda unos 35 s en construirse
    // al arrancar el servidor, y quien entra en ese medio minuto tiene que
    // leer que espere, no que la consulta falla. 503 y no 500: es temporal, y
    // así lo dice también a quien mire las cabeceras.
    if (e instanceof ListaEnConstruccion) {
      return NextResponse.json(
        { error: e.message, construyendo: true },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } },
      );
    }
    console.error("[publico] lista falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudieron cargar los pedidos" }, { status: 500 });
  }
}
