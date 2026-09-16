import { NextResponse } from "next/server";
import { exigir, identidad, loginActivo } from "@/lib/server/sesion";

// ─── /api/fases ──────────────────────────────────────────────────────────────
// GET: en qué estado tiene OLANET las fases de estas OF.
// POST: cierra una fase de OT que se quedó a medias.
//
// POR QUÉ EXISTE. Se pasaba el pedido a Producción y la fase de OT se quedaba
// en pausa: nadie la cerraba y tenían que avisar desde el taller, y arreglarlo
// obligaba a abrir la herramienta vieja. De aquí en adelante no debería pasar
// —"Pasar a Producción" ya mueve la fase—, así que esto es para el arrastre:
// 125 fases sin cerrar medidas el 24/08/2026, desde 2020, casi todas de
// urgencias.
//
// ESTO ESCRIBE EN EL SISTEMA DE LA FÁBRICA, y con el fichaje en activo va en
// serio. Por eso el POST no se fía de nada de lo que le manden salvo el
// boletín: vuelve a leer de OLANET la máquina y el estado, y decide él.

export const dynamic = "force-dynamic";

const noJson = () => NextResponse.json({ error: "JSON inválido" }, { status: 400 });

/** Códigos de OF de RPS: dígitos, nada más. Cierra la puerta a que por aquí
 *  entre cualquier cosa hacia la consulta. */
const OF_RE = /^\d{1,20}$/;

export async function GET(req: Request) {
  // Las lecturas se cierran solo con el login encendido: apagado no llega
  // identidad por ningún lado y exigirla dejaría la ficha en blanco.
  if (loginActivo()) {
    const yo = exigir(req);
    if (yo instanceof NextResponse) return yo;
  }
  const crudo = new URL(req.url).searchParams.get("ofs") ?? "";
  const ofs = crudo.split(",").map((s) => s.trim()).filter(Boolean);
  if (ofs.length === 0) return NextResponse.json({ fases: [] }, { headers: { "Cache-Control": "no-store" } });
  if (ofs.length > 100 || !ofs.every((o) => OF_RE.test(o)))
    return NextResponse.json({ error: "Lista de OF no válida" }, { status: 400 });

  try {
    const { fasesDeOFs } = await import("@/lib/server/olanet");
    return NextResponse.json(
      { fases: await fasesDeOFs(ofs) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    // OLANET caído o sin VPN. No es un fallo del pedido: la ficha lo dice y
    // sigue enseñando todo lo demás.
    console.warn("[coordina] no se pudieron leer las fases:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo consultar OLANET" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return noJson();
  }
  if (typeof cuerpo !== "object" || cuerpo === null) return noJson();
  const b = cuerpo as Record<string, unknown>;

  const idBoletin = typeof b.idBoletin === "string" && /^\d{1,20}$/.test(b.idBoletin) ? b.idBoletin : null;
  if (!idBoletin) return NextResponse.json({ error: "Falta idBoletin" }, { status: 400 });

  // Quién finaliza esto lo decide identidad(), no el cuerpo: es lo que se
  // firma en OLANET como autor del movimiento.
  const yo = identidad(req, b.operarioId, "tecnico");
  if (yo instanceof NextResponse) return yo;
  const operarioId = yo.id;

  // Sin código de RPS no se puede firmar el movimiento a nombre de nadie, y
  // dejarlo en blanco ensuciaría el histórico del taller.
  const { COD_RPS_POR_OPERARIO } = await import("@/lib/server/operarios");
  const operarioRps = COD_RPS_POR_OPERARIO[operarioId];
  if (!operarioRps)
    return NextResponse.json(
      { error: `${operarioId} no tiene código de operario en RPS` },
      { status: 400 },
    );

  // De qué fase se habla, por si el boletín ya no vale. Opcionales: si no
  // llegan, se hace lo de siempre.
  const of = typeof b.of === "string" && OF_RE.test(b.of) ? b.of : null;
  const fase = typeof b.fase === "string" && /^[\w-]{1,20}$/.test(b.fase) ? b.fase : null;

  try {
    const { modoFichaje } = await import("@/lib/server/olanet-outbox");
    // Antes esto escribía siempre, sin mirar el modo del fichaje — no había
    // hecho falta porque nadie más escribía un movimiento de fase desde la
    // web. Al compartir `finalizarFase` con la ruta nueva de cerrar una OF
    // suelta, que sí necesita el gate, el arrastre lo hereda: en `activo` no
    // cambia nada (Confirmado con Iván, punto 1).
    if (modoFichaje() !== "activo")
      return NextResponse.json(
        { error: "El fichaje está en modo de pruebas: no se escribe en RPS." },
        { status: 409 },
      );

    const { finalizarFase } = await import("@/lib/server/olanet");
    const { esFaseDeLaWeb } = await import("@/lib/secciones");
    const r = await finalizarFase({
      idBoletin,
      of,
      fase,
      esNuestra: esFaseDeLaWeb,
      operarioRps,
      cuando: new Date(),
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, yaEstaba: r.yaEstaba });
  } catch (e) {
    console.warn("[coordina] no se pudo finalizar la fase:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo escribir en OLANET" }, { status: 503 });
  }
}
