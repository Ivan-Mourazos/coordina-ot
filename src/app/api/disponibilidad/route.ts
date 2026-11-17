import { NextResponse } from "next/server";
import { mesValido, type RespuestaDisponibilidad } from "@/lib/disponibilidad";
import { bizneoActivo, leerDisponibilidadMes } from "@/lib/server/bizneo";
import { soloConSesion } from "@/lib/server/sesion";
import { hoyISO } from "@/lib/types";

// ─── GET /api/disponibilidad?mes=YYYY-MM ────────────────────────────────────
// El calendario del equipo de un mes, sacado de Bizneo (solo lectura). Solo
// con sesión: son datos de personas, no van a la consulta pública.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;

  if (!bizneoActivo()) return NextResponse.json({ activo: false } satisfies RespuestaDisponibilidad);

  const mes = mesValido(new URL(req.url).searchParams.get("mes")) ?? hoyISO().slice(0, 7);
  try {
    const datos = await leerDisponibilidadMes(mes);
    return NextResponse.json({ activo: true, ...datos } satisfies RespuestaDisponibilidad, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[disponibilidad] Bizneo falló:", (error as Error).message);
    return NextResponse.json({ error: "No se pudo leer Bizneo" }, { status: 502 });
  }
}
