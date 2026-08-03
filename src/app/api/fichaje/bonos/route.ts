import { NextResponse } from "next/server";
import { leerCola, leerPendientes, modoFichaje } from "@/lib/server/bonos-outbox";

// ─── /api/fichaje/bonos ──────────────────────────────────────────────────────
// Ventana a la cola de salida hacia OLANET. Sirve para el modo sombra: dejar
// que la gente fiche unos días en CoordinaOT y comparar estas filas con las que
// graba el mini-olanet, ANTES de escribir de verdad en OFs reales.
//   ?pendientes=1 → solo lo que aún no se ha enviado.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const soloPendientes = params.get("pendientes") === "1";
  const bonos = soloPendientes ? leerPendientes() : leerCola();
  return NextResponse.json(
    { modo: modoFichaje(), total: bonos.length, bonos },
    { headers: { "Cache-Control": "no-store" } },
  );
}
