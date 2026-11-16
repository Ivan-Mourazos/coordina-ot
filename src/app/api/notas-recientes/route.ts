import { NextResponse } from "next/server";
import { VENTANA_AVISOS_DIAS } from "@/lib/avisos";
import { leerAvisosNotas } from "@/lib/server/notas-db";
import { lectorDePeticion } from "@/lib/server/lector-sesion";
import { soloConSesion } from "@/lib/server/sesion";

// ─── GET /api/notas-recientes ────────────────────────────────────────────────
// Los avisos de notas de la campana: las de los últimos días que van CONTIGO
// (te mencionan, mencionan a una sección tuya o te tienen en su público).
// Desde el 16/11/2026 ya no devuelve todas las notas: con notas restringidas,
// mandar el texto de todas al navegador sería una fuga, y además la campana
// sonaba por cualquier nota de cualquiera.
//
// APARTE del hilo de un pedido (/api/notas) a propósito: aquel contesta "qué
// hay en ESTE pedido" y lo pide el drawer al abrirlo; este contesta "qué me
// han escrito últimamente" y lo pide el tablero.
//
// Sin sesión (login apagado) no hay a quién avisar: lista vacía.

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;

  const lector = lectorDePeticion(req);
  return NextResponse.json(
    {
      avisos: lector ? leerAvisosNotas(lector, VENTANA_AVISOS_DIAS) : [],
      // Para que la campana diga por qué te llega cada una (motivoAviso).
      destinos: lector?.destinos ?? [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
