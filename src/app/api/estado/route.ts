import { NextResponse } from "next/server";
import { guardarMutacion } from "@/lib/server/estado-db";
import { encolarFinalizacion } from "@/lib/server/olanet-outbox";
import { ESTADOS_OF, type CambioOF } from "@/lib/server/overlay";

// ─── POST /api/estado ────────────────────────────────────────────────────────
// Persiste una mutación del tablero (asignar, revisor, acción de estado,
// completar pedido). El Board la manda con el resultado ya calculado: cada
// cambio es el snapshot completo de los 4 campos de flujo de la OF.

interface Body {
  operarioId?: string | null;
  motivo?: string;
  cambiosOF?: CambioOF[];
  completarPedidoId?: string;
  ofIdsPedido?: string[];
}

function cambioValido(c: unknown): c is CambioOF {
  if (typeof c !== "object" || c === null) return false;
  const x = c as Record<string, unknown>;
  const idOk = typeof x.ofId === "string" && x.ofId.length > 0;
  const nulable = (v: unknown) => v === null || typeof v === "string";
  return (
    idOk &&
    nulable(x.autorId) &&
    nulable(x.revisorId) &&
    typeof x.estado === "string" &&
    ESTADOS_OF.has(x.estado) &&
    nulable(x.observacion)
  );
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const cambios = body.cambiosOF ?? [];
  if (!body.motivo || typeof body.motivo !== "string")
    return NextResponse.json({ error: "Falta motivo" }, { status: 400 });
  if (!cambios.every(cambioValido))
    return NextResponse.json({ error: "cambiosOF inválidos" }, { status: 400 });
  if (cambios.length === 0 && !body.completarPedidoId)
    return NextResponse.json({ error: "Mutación vacía" }, { status: 400 });

  const operarioId = typeof body.operarioId === "string" ? body.operarioId : null;
  const completarPedidoId =
    typeof body.completarPedidoId === "string" ? body.completarPedidoId : undefined;

  guardarMutacion({
    operarioId,
    motivo: body.motivo,
    cambiosOF: cambios,
    completarPedidoId,
  });

  // Pasar el pedido a Producción es lo que da las fases por terminadas en
  // OLANET (IdEstadoOF = 3): el fichaje por sí solo nunca finaliza nada. Va
  // después de guardar y sin bloquear la respuesta — encolarFinalizacion no
  // lanza, y si algo falla el pedido queda "interrumpido" en vez de
  // "finalizado", que se ve y se puede volver a pasar.
  if (completarPedidoId && operarioId) {
    const ofIds = Array.isArray(body.ofIdsPedido)
      ? body.ofIdsPedido.filter((x): x is string => typeof x === "string" && x.length > 0)
      : [];
    encolarFinalizacion(ofIds, operarioId);
  }
  return NextResponse.json({ ok: true });
}
