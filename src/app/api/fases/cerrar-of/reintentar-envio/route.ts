import { NextResponse } from "next/server";
import { identidad } from "@/lib/server/sesion";
import { getTablero } from "@/lib/data";
import { aplicarOverlay } from "@/lib/server/overlay";
import { leerOverlay } from "@/lib/server/estado-db";
import { esSeccionId } from "@/lib/secciones";
import { seccionDeOperario, COD_RPS_POR_OPERARIO } from "@/lib/server/operarios";

// ─── POST /api/fases/cerrar-of/reintentar-envio ──────────────────────────────
// «Reintentar envío»: spec 2026-09-15-material-gastado-y-cerrar-of-design.md,
// «Confirmado con Iván» punto 5. Cuando un tramo de la OF se DESCARTÓ tras 5
// fallos, «Dar por terminada en RPS» contesta 409 y se queda así para
// siempre: nada vuelve a intentar ese tramo solo. Este botón lo devuelve a la
// cola, con los intentos a cero (`reencolarDescartados`), para que el
// PRÓXIMO drenado —el de siempre, con las reglas de siempre— lo intente otra
// vez. La ruta en sí NO escribe nada en OLANET.

export const dynamic = "force-dynamic";

const OF_ID_RE = /^\d{1,20}:[\w-]{1,20}$/;

export async function POST(req: Request) {
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (typeof cuerpo !== "object" || cuerpo === null)
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const b = cuerpo as Record<string, unknown>;
  const ofId = typeof b.ofId === "string" && OF_ID_RE.test(b.ofId) ? b.ofId : null;
  if (!ofId) return NextResponse.json({ error: "Falta ofId" }, { status: 400 });

  const yo = identidad(req, b.operarioId, "tecnico");
  if (yo instanceof NextResponse) return yo;
  const operarioId = yo.id;
  if (!COD_RPS_POR_OPERARIO[operarioId])
    return NextResponse.json({ error: `${operarioId} no tiene código de operario en RPS` }, { status: 400 });

  const seccionId = esSeccionId(b.seccion) ? b.seccion : seccionDeOperario(operarioId);

  const base = await getTablero(seccionId);
  const tablero = aplicarOverlay(base, leerOverlay(seccionId));
  const of = tablero.pedidos.flatMap((p) => p.ofs).find((o) => o.id === ofId);
  if (!of) return NextResponse.json({ error: "OF no encontrada" }, { status: 404 });
  if (of.autorId !== operarioId)
    return NextResponse.json({ error: "Solo el autor de la OF puede reintentar su envío." }, { status: 403 });

  const [orden, numope] = ofId.split(":");
  const { reencolarDescartados, modoFichaje } = await import("@/lib/server/olanet-outbox");
  const reencolados = reencolarDescartados(orden, numope);

  // La escritura de verdad la hace la cola de siempre, con las reglas de
  // siempre (modoFichaje). En sombra ni se intenta: los eventos se quedan
  // pendientes hasta que el modo cambie, que es lo correcto — igual que
  // cualquier otro fichaje en sombra.
  if (modoFichaje() === "activo") {
    try {
      const { drenarCola } = await import("@/lib/server/olanet-worker");
      await drenarCola();
    } catch (e) {
      // No es un fallo de ESTA ruta: los eventos ya han vuelto a la cola (lo
      // que promete «reencolados»), y el worker periódico los recogerá en su
      // siguiente vuelta si este intento inmediato no cuaja.
      console.warn("[coordina] no se pudo drenar la cola tras reintentar el envío:", (e as Error).message);
    }
  }

  return NextResponse.json({ ok: true, reencolados });
}
