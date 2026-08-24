import { NextResponse } from "next/server";
import { marcarVisto } from "@/lib/server/scan-db";

// ─── POST /api/pedido-scan ───────────────────────────────────────────────────
// Dar por visto el parte re-escaneado de un pedido: apaga su distintivo.
//
// Solo escribe. Para LEER quién tiene el parte cambiado no hay endpoint a
// propósito: eso ya viaja en el tablero (`Pedido.scanCambiado`), que es lo que
// el Board sondea cada 30 s. Un endpoint aparte sería una segunda vuelta por lo
// mismo, y las dos podrían discrepar.
//
// APAGA PARA TODOS, no solo para quien pulsa: lo acordado es que el aviso es
// del pedido —quien mira el parte nuevo, lo mira por el equipo—. Por eso no
// lleva `operarioId`: no habría nada que hacer con él. Lo que queda como
// registro permanente de que pasó es la nota del hilo, que no la borra nadie.

export const dynamic = "force-dynamic";

/** Un código de pedido cabe de sobra; el tope evita que entre un texto entero
 *  por el sitio de la clave. */
const PEDIDO_MAX = 60;

export async function POST(req: Request) {
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  // Un JSON que no sea objeto (el literal `null`, un número) parsea sin error:
  // sin esta guarda, leerle una propiedad reventaría con un 500.
  if (typeof cuerpo !== "object" || cuerpo === null) {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const crudo = (cuerpo as Record<string, unknown>).pedido;
  const pedido = typeof crudo === "string" ? crudo.trim() : "";
  if (!pedido || pedido.length > PEDIDO_MAX) {
    return NextResponse.json({ error: "Falta pedido" }, { status: 400 });
  }

  // `false` es "ese pedido no tenía nada pendiente que dar por visto": no es un
  // error —dos personas pueden pulsar a la vez y la segunda llega tarde—, así
  // que se contesta 200 diciendo que ya no queda aviso.
  return NextResponse.json({ ok: true, apagado: marcarVisto(pedido) });
}
