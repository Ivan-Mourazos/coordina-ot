import { NextResponse } from "next/server";
import { getTablero } from "@/lib/data";
import { seccionDeOperario } from "@/lib/server/operarios";
import { esSeccionId } from "@/lib/secciones";

// ─── GET /api/tablero ────────────────────────────────────────────────────────
// Tablero completo (RPS/mock + overlay) para el polling de sincronización del
// Board. Barato: la consulta pesada vive tras la caché stale-while-revalidate.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Por defecto la sección se deduce de QUIÉN pregunta: cada uno entra en la
  // suya sin tener que elegir nada.
  //
  // Y SE PUEDE PEDIR OTRA. Ángel supervisa las dos y necesita mirar la lista de
  // Diseño Gráfico sin dejar de ser Ángel —con su reloj, sus avisos y su
  // autoría, que van todos atados a su id—. Un segundo usuario habría partido
  // todo eso en dos.
  //
  // Que cualquiera pueda pedir cualquier sección es deliberado y no es un
  // agujero: aquí no hay nada que proteger. La app es sin login, el trabajo de
  // las dos secciones es el mismo trabajo de la casa, y mirar la lista de al
  // lado no deja hacer nada que no se pudiera hacer ya. Lo que NO cambia es
  // quién eres: eso sigue viniendo del operario y no de la URL.
  const q = new URL(req.url).searchParams;
  const operarioId = q.get("operarioId");
  const pedida = q.get("seccion");
  const seccion = esSeccionId(pedida)
    ? pedida
    : operarioId
      ? seccionDeOperario(operarioId)
      : undefined;
  const tablero = await getTablero(seccion);
  return NextResponse.json(tablero, {
    headers: { "Cache-Control": "no-store" },
  });
}
