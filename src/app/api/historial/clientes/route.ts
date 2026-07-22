import { NextResponse } from "next/server";
import { leerClientesHistorial } from "@/lib/server/historial-db";

// ─── GET /api/historial/clientes?q=texto ─────────────────────────────────────
// Autocompletar de cliente: hasta 20 nombres distintos del histórico de OT que
// contengan q (mín. 2 caracteres). Solo lectura.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    const clientes = await leerClientesHistorial(q);
    return NextResponse.json({ clientes }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[historial] clientes falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudieron cargar los clientes" }, { status: 500 });
  }
}
