import { NextResponse } from "next/server";
import { seccionConSolicitudes } from "@/lib/solicitudes";
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
    return NextResponse.json(
      { solicitudes: await leerSolicitudes(seccion) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[solicitudes] RPS falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudieron cargar las solicitudes" }, { status: 500 });
  }
}
