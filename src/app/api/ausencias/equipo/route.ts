import { NextResponse } from "next/server";
import { operariosDeSeccion } from "@/lib/server/operarios";
import { leerPersona } from "@/lib/server/personas-db";
import { soloConSesion } from "@/lib/server/sesion";
import { ausenciasDe } from "@/lib/server/visitas-db";

// ─── /api/ausencias/equipo ──────────────────────────────────────────────────
// Quién de OT no está qué días, para el calendario de Visitas. Sin notas: fuera
// de «Mis ausencias» una ausencia es «no está en OT» y nada más. Con sesión
// siempre: la consulta sin login usa /api/publico/visitas y no llega aquí.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;
  const ids = operariosDeSeccion("ot");
  return NextResponse.json(
    {
      nombres: Object.fromEntries(ids.map((id) => [id, (leerPersona(id)?.nombre ?? id).trim().split(/\s+/)[0]])),
      ausencias: ausenciasDe(ids),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
