import { NextResponse } from "next/server";
import { claveValida, filasDeOficinaTecnica, leerOfsPedidas, resumirOf } from "@/lib/integracion";
import { leerOverlayPorOrdenes } from "@/lib/server/estado-db";
import { prioridadesDeOfs, tablerosEnMemoria } from "@/lib/server/prioridades";

// ─── GET /api/integracion/ofs?ofs=0230194,0230195 ────────────────────────────
// Solo lectura, para la web de planteamientos: cómo está cada OF (aprobada,
// devuelta con su nota, en revisión…). Pide la cabecera X-Clave-Integracion
// igual a INTEGRACION_CLAVE. Sin la variable configurada no responde nada:
// una integración a medio montar no debe quedar abierta.
// Solo sale `of`, `estado`, `nota`, `actualizado`, `autor` (quién la lleva), `prioridad`
// (la del pedido, si el tablero ya está en memoria; nunca se espera a RPS) y `revisor` (quién la aprobó,
// solo si está aprobada, para el campo REVISOR de planteamientos): ni cliente,
// ni más personas, ni notas internas.
//
// Solo cuentan las tareas de Oficina Técnica (Iván, 29/09/2026): planteamientos
// espera la revisión de OT, y una tarea de Diseño Gráfico de la misma OF no debe
// bloquearla ni poner su nota o su revisor. Ver `filasDeOficinaTecnica`.

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
  // Si leer la memoria fallara, el estado de las OF sale igual, sin prioridad.
  const prioridades = prioridadesDeOfs(await tablerosEnMemoria().catch(() => []), ofs);
  return NextResponse.json({ ofs: ofs.map((of) => resumirOf(of, filasDeOficinaTecnica(filas.get(of) ?? []), prioridades.get(of))) }, { headers: sinCache });
}
