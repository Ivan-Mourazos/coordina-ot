import { NextResponse } from "next/server";
import { VENTANA_AVISOS_DIAS } from "@/lib/avisos";
import { leerNotasRecientes } from "@/lib/server/notas-db";
import { soloConSesion, loginActivo, quienEs } from "@/lib/server/sesion";
import { veNotasInternas } from "@/lib/personas";

// ─── GET /api/notas-recientes ────────────────────────────────────────────────
// Las notas de los últimos días, para que la campana avise al resto del equipo
// de que alguien ha dejado una.
//
// APARTE del hilo de un pedido (/api/notas) a propósito: aquel contesta "qué
// hay en ESTE pedido" y lo pide el drawer al abrirlo; este contesta "qué se ha
// escrito últimamente" y lo pide el tablero. Meterlos en la misma ruta
// obligaría a distinguir por parámetro dos preguntas que no se parecen.

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;

  const yo = loginActivo() ? quienEs(req) : null;
  const notas = leerNotasRecientes(VENTANA_AVISOS_DIAS);
  return NextResponse.json(
    { notas: yo && !veNotasInternas(yo.roles) ? notas.filter((n) => n.publica || n.operarioId === yo.id) : notas },
    { headers: { "Cache-Control": "no-store" } },
  );
}
