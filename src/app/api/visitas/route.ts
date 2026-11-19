import { NextResponse } from "next/server";
import { PREFIJO_NOTA_VISITA } from "@/lib/correo-visita";
import { validarVisita } from "@/lib/visita";
import { puedeEscribirNotas } from "@/lib/personas";
import { lectorDePeticion } from "@/lib/server/lector-sesion";
import { leerNotas } from "@/lib/server/notas-db";
import { operariosDeSeccion } from "@/lib/server/operarios";
import { pedirVisita } from "@/lib/server/pedir-visita";
import { identidad, soloConSesion } from "@/lib/server/sesion";
import { visitaDisponible } from "@/lib/server/visita-correo-cola";
import { ausenciasDe, nombresVisita } from "@/lib/server/visitas-db";

// ─── /api/visitas ───────────────────────────────────────────────────────────
// GET: lo que necesita la ventana de «Pedir visita». POST: la pide (nota en el
// pedido + correo a Instalaciones por la cola).

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;
  const pedido = new URL(req.url).searchParams.get("pedido")?.trim() ?? "";
  if (!pedido || pedido.length > 60) return NextResponse.json({ error: "Falta pedido" }, { status: 400 });
  const disponible = visitaDisponible();
  if (!disponible) return NextResponse.json({ disponible, nombres: [], ausencias: [], ultimaNota: null });
  // leerNotas devuelve las más antiguas primero (ORDER BY creado_at, id).
  const ultima = leerNotas(pedido, lectorDePeticion(req))
    .filter((n) => n.texto.startsWith(PREFIJO_NOTA_VISITA))
    .at(-1);
  return NextResponse.json(
    {
      disponible,
      nombres: nombresVisita(),
      ausencias: ausenciasDe(operariosDeSeccion("ot")),
      ultimaNota: ultima ? { texto: ultima.texto, creadoAt: ultima.creadoAt } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    const v: unknown = await req.json();
    if (typeof v !== "object" || v === null) throw new Error();
    b = v as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const yo = identidad(req, b.operarioId);
  if (yo instanceof NextResponse) return yo;
  if (!puedeEscribirNotas(yo.roles)) return NextResponse.json({ error: "Esta cuenta es de solo lectura" }, { status: 403 });
  if (!visitaDisponible()) return NextResponse.json({ error: "El correo de visitas está apagado" }, { status: 503 });
  const v = validarVisita(b);
  if (!v.ok) return NextResponse.json({ error: v.error, campo: v.campo }, { status: 400 });
  try {
    pedirVisita(v.entrada, { id: yo.id, nombre: yo.nombre });
  } catch (e) {
    // Solo el «quien atiende no existe» es culpa de la petición; lo demás
    // (la base de datos) es un 500 de verdad, no un error en el campo.
    const msg = (e as Error).message;
    if (!msg.startsWith("Quien atiende no existe")) throw e;
    return NextResponse.json({ error: msg, campo: "atienden" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
