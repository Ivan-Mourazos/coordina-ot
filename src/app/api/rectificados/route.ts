import { NextResponse } from "next/server";
import {
  CODIGO_NC_RE,
  RECTIFICADOS_DESDE,
  esResultadoRectificado,
  rectificadosDeSeccion,
  seccionConRectificados,
} from "@/lib/rectificados";
import { hoyISO } from "@/lib/types";
import {
  borrarMarcaRectificado,
  guardarMarcaRectificado,
  leerMarcasRectificado,
} from "@/lib/server/estado-db";
import { clientesDePedidos, leerNcPeriodo } from "@/lib/server/nc-db";
import { identidad, soloConSesion } from "@/lib/server/sesion";

// ─── /api/rectificados ───────────────────────────────────────────────────────
// La lista de rectificados por revisar de una sección y sus marcas. Las NC
// vienen de RPS, de solo lectura (con los 10 minutos de caché de
// `leerNcPeriodo`); lo único que se escribe es la marca, en la base de Coordina.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;

  const seccion = new URL(req.url).searchParams.get("seccion");
  if (!seccionConRectificados(seccion)) {
    return NextResponse.json({ error: "Sección no válida" }, { status: 400 });
  }
  try {
    const todas = (await leerNcPeriodo({ desde: RECTIFICADOS_DESDE, hasta: hoyISO() })) ?? [];
    const clientes = await clientesDePedidos(todas.flatMap((nc) => (nc.pedido ? [nc.pedido] : [])));
    const rectificados = rectificadosDeSeccion(todas, seccion, leerMarcasRectificado(seccion), clientes);
    return NextResponse.json({ rectificados }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[rectificados] no se pudieron leer:", (e as Error).message);
    return NextResponse.json({ error: "No se pudieron cargar los rectificados" }, { status: 500 });
  }
}

async function cuerpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b: unknown = await req.json();
    return typeof b === "object" && b !== null ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** La NC y la sección de una petición de escritura, ya comprobadas. */
function destino(b: Record<string, unknown>) {
  const { nc, seccion } = b;
  if (typeof nc !== "string" || !CODIGO_NC_RE.test(nc)) return null;
  if (!seccionConRectificados(seccion)) return null;
  return { nc, seccion };
}

/** Marca un rectificado como revisado. */
export async function POST(req: Request) {
  const b = await cuerpo(req);
  if (!b) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const d = destino(b);
  if (!d || !esResultadoRectificado(b.resultado)) {
    return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  }
  const yo = identidad(req, b.operarioId, "tecnico");
  if (yo instanceof NextResponse) return yo;

  guardarMarcaRectificado(d.nc, d.seccion, {
    resultado: b.resultado,
    quien: yo.id,
    nombre: yo.nombre,
    en: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}

/** Deshace la marca: vuelve a estar por revisar. */
export async function DELETE(req: Request) {
  const b = await cuerpo(req);
  if (!b) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const d = destino(b);
  if (!d) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  const yo = identidad(req, b.operarioId, "tecnico");
  if (yo instanceof NextResponse) return yo;

  borrarMarcaRectificado(d.nc, d.seccion);
  return NextResponse.json({ ok: true });
}
