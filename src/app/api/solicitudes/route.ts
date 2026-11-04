import { NextResponse } from "next/server";
import { seccionConSolicitudes, sinCoger } from "@/lib/solicitudes";
import { leerSolicitudes } from "@/lib/server/solicitudes-db";
import { soloConSesion } from "@/lib/server/sesion";

// ─── GET /api/solicitudes?seccion=ot ─────────────────────────────────────────
// Las solicitudes de comerciales de una sección (ver lib/solicitudes.ts). Solo
// lectura: coger una se hace en RPS.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;

  const seccion = new URL(req.url).searchParams.get("seccion");
  if (!seccionConSolicitudes(seccion)) {
    return NextResponse.json({ error: "Sección no válida" }, { status: 400 });
  }
  try {
    const solicitudes = await leerSolicitudes(seccion);
    // El número de la pestaña: con el histórico entero, mandar todo para contar
    // las de arriba era pesado.
    if (new URL(req.url).searchParams.get("contador") === "1") {
      return NextResponse.json({ sinCoger: sinCoger(solicitudes) }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(
      { solicitudes },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[solicitudes] RPS falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudieron cargar las solicitudes" }, { status: 500 });
  }
}
