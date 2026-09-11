import { NextResponse } from "next/server";
import { leerHistorialPagina } from "@/lib/server/historial-db";
import { seccionDe } from "@/lib/secciones";
import { getTablero } from "@/lib/data";
import { codigoRpsDe } from "@/lib/server/operarios";

// ─── GET /api/historial ──────────────────────────────────────────────────────
// Página del historial permanente de pedidos finalizados según la sección. El page size
// lo fija el server (no viene del cliente). Filtros opcionales: q, desde, hasta.

export const dynamic = "force-dynamic";

/** El filtro por persona. El código de RPS sale de NUESTRA tabla de equipo,
 *  nunca del navegador: con un id que no es del equipo no hay código y la
 *  consulta no devuelve nada (ver `construirFiltros`). */
function filtroOperario(id: string | null): { operario?: string; empleado?: string } {
  const operario = id?.trim();
  if (!operario) return {};
  return { operario, empleado: codigoRpsDe(operario) ?? undefined };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const pageRaw = Number(url.searchParams.get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw >= 0 ? pageRaw : 0;

  try {
    const seccion = seccionDe(url.searchParams.get("seccion")).id;
    const tablero = await getTablero(seccion);
    // Antes de paginar: quitar filas después deja huecos y un hasMore falso.
    // Incluso aprobadas siguen pendientes hasta que el autor pulse Pasar.
    const pendientes = tablero.pedidos.filter((p) => p.situacion !== "completado"
      && p.ofs.some((of) => !of.ajenaOT)).map((p) => p.codigo);
    const data = await leerHistorialPagina({
      page,
      seccion,
      q: url.searchParams.get("q") ?? undefined,
      desde: url.searchParams.get("desde") ?? undefined,
      hasta: url.searchParams.get("hasta") ?? undefined,
      familia: url.searchParams.get("familia") ?? undefined,
      cliente: url.searchParams.get("cliente") ?? undefined,
      soloSeccion: url.searchParams.get("soloSeccion") === "1",
      ...filtroOperario(url.searchParams.get("operario")),
      pendientes,
    });
    const busqueda = url.searchParams.get("q")?.trim();
    return NextResponse.json({
      ...data,
      pedidos: data.pedidos.map((pedido) => ({ ...pedido, ...(busqueda ? { busqueda } : {}) })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[historial] página falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo cargar el historial" }, { status: 500 });
  }
}
