import { NextResponse } from "next/server";
import { getTablero } from "@/lib/data";
import { aplicarFiltros, FILTROS_INICIALES } from "@/lib/filtros";
import { pedidoParaInvitado } from "@/lib/publico";
import { SECCIONES, SECCION_POR_DEFECTO, esSeccionId } from "@/lib/secciones";
import { hoyISO } from "@/lib/types";

// ─── GET /api/publico/en-curso ───────────────────────────────────────────────
// El trabajo que tiene ahora la oficina (OT o Diseño Gráfico), para quien no
// tiene sesión: la misma lista que la Pendientes del equipo con sus filtros de
// salida, y cada pedido limpiado en `pedidoParaInvitado` — notas, avisos,
// devoluciones, material y prioridad no viajan.
//
// Las personas, solo con lo que hace falta para nombrarlas: id, nombre,
// iniciales, color y sección. Igual que en la ficha del invitado, se ve quién
// lleva cada pedido.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const pedida = new URL(req.url).searchParams.get("seccion");
  const seccion = esSeccionId(pedida) ? pedida : SECCION_POR_DEFECTO;
  try {
    const tablero = await getTablero(seccion);
    const pedidos = aplicarFiltros(tablero.pedidos, FILTROS_INICIALES, hoyISO(), {
      internosComoTrabajo: SECCIONES[seccion].internosComoTrabajo === true,
    }).map(pedidoParaInvitado);
    const operarios = tablero.operarios.map((o) => ({
      id: o.id,
      nombre: o.nombre,
      iniciales: o.iniciales,
      color: o.color,
      ...(o.seccion ? { seccion: o.seccion } : {}),
    }));
    return NextResponse.json({ operarios, pedidos }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[publico] en curso falló:", (error as Error).message);
    return NextResponse.json({ error: "No se pudo cargar el trabajo en curso" }, { status: 500 });
  }
}
