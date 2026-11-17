import { NextResponse } from "next/server";
import type { RespuestaFueraHoy } from "@/lib/disponibilidad";
import { bizneoActivo, leerFueraEnFecha } from "@/lib/server/bizneo";
import { soloConSesion } from "@/lib/server/sesion";
import { hoyISO } from "@/lib/types";

// ─── GET /api/disponibilidad/hoy ────────────────────────────────────────────
// Quién está fuera HOY y cuándo vuelve. Lo piden el tablero (aviso en la
// tarjeta de cada compañero) y la pantalla de Producción.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;

  if (!bizneoActivo()) return NextResponse.json({ activo: false } satisfies RespuestaFueraHoy);

  const fecha = hoyISO();
  try {
    const r = await leerFueraEnFecha(fecha);
    return NextResponse.json({ activo: true, fecha, ...r } satisfies RespuestaFueraHoy, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[disponibilidad] Bizneo falló:", (error as Error).message);
    return NextResponse.json({ error: "No se pudo leer Bizneo" }, { status: 502 });
  }
}
