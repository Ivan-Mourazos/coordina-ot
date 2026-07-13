import { NextResponse } from "next/server";
import { guardarMutacion } from "@/lib/server/estado-db";
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

  guardarMutacion({
    operarioId: typeof body.operarioId === "string" ? body.operarioId : null,
    motivo: body.motivo,
    cambiosOF: cambios,
    completarPedidoId:
      typeof body.completarPedidoId === "string" ? body.completarPedidoId : undefined,
  });
  return NextResponse.json({ ok: true });
}
