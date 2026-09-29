import { NextResponse } from "next/server";
import { claveValida, leerOfsPedidas, resumirOf } from "@/lib/integracion";
import { leerOverlayPorOrdenes } from "@/lib/server/estado-db";

// ─── GET /api/integracion/ofs?ofs=0230194,0230195 ────────────────────────────
// Solo lectura, para la web de planteamientos: cómo está cada OF (aprobada,
// devuelta con su nota, en revisión…). Pide la cabecera X-Clave-Integracion
// igual a INTEGRACION_CLAVE. Sin la variable configurada no responde nada:
// una integración a medio montar no debe quedar abierta.
// Solo sale `of`, `estado`, `nota` y `actualizado`: ni cliente, ni personas,
// ni notas internas.

export const dynamic = "force-dynamic";

const sinCache = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const esperada = process.env.INTEGRACION_CLAVE;
  if (!esperada) {
    return NextResponse.json({ error: "Integración sin configurar" }, { status: 503, headers: sinCache });
  }
  if (!claveValida(req.headers.get("x-clave-integracion"), esperada)) {
    return NextResponse.json({ error: "Clave no válida" }, { status: 401, headers: sinCache });
  }
  const ofs = leerOfsPedidas(new URL(req.url).searchParams.get("ofs"));
  if (!ofs) {
    return NextResponse.json({ error: "Lista de OF no válida" }, { status: 400, headers: sinCache });
  }
  const filas = leerOverlayPorOrdenes(ofs);
  return NextResponse.json({ ofs: ofs.map((of) => resumirOf(of, filas.get(of) ?? [])) }, { headers: sinCache });
}
