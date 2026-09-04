import { NextResponse } from "next/server";
import { getTablero } from "@/lib/data";
import { seccionDeOperario } from "@/lib/server/operarios";
import { esSeccionId } from "@/lib/secciones";
import { versionDelServidor } from "@/lib/server/version";

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
    headers: {
      "Cache-Control": "no-store",
      // QUÉ VERSIÓN ESTÁ SIRVIENDO ESTE SERVIDOR. Va como cabecera y no dentro
      // del JSON para no tocar el tipo del tablero por algo que no es del
      // tablero. El Board ya pregunta aquí cada 30 s: comparándola con la que
      // tenía al cargar se entera de un despliegue sin una sola petición más.
      //
      // Hace falta porque una pestaña abierta desde antes se queda con el
      // código viejo, y con Next eso además se rompe: los trozos de JavaScript
      // de la versión anterior ya no existen en el servidor y al navegar dan
      // 404. Ver `VersionNueva`.
      "X-Coordina-Version": versionDelServidor(),
    },
  });
}
