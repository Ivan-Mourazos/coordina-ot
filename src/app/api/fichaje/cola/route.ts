import { NextResponse } from "next/server";
import { leerCola, leerPendientes, modoFichaje } from "@/lib/server/olanet-outbox";

// ─── /api/fichaje/cola ───────────────────────────────────────────────────────
// Ventana a la cola de salida hacia OLANET: líneas de tiempo (tipo "bono") y
// movimientos de fase (tipo "fase"). Sirve para el modo sombra: dejar que la
// gente fiche unos días en CoordinaOT y comparar esto con lo que graba el
// mini-olanet, ANTES de escribir de verdad en OFs reales.
//   ?pendientes=1 → solo lo que aún no se ha enviado.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const soloPendientes = new URL(req.url).searchParams.get("pendientes") === "1";
  const eventos = soloPendientes ? leerPendientes() : leerCola();
  return NextResponse.json(
    { modo: modoFichaje(), total: eventos.length, eventos },
    { headers: { "Cache-Control": "no-store" } },
  );
}
