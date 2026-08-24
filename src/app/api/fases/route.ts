import { NextResponse } from "next/server";
import { ESTADO_OF, esFaseDeOT, situacionDe } from "@/lib/fase-pendiente";

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
  const operarioId = typeof b.operarioId === "string" && b.operarioId.length > 0 ? b.operarioId : null;
  if (!idBoletin) return NextResponse.json({ error: "Falta idBoletin" }, { status: 400 });
  if (!operarioId) return NextResponse.json({ error: "Falta operarioId" }, { status: 400 });

  // Sin código de RPS no se puede firmar el movimiento a nombre de nadie, y
  // dejarlo en blanco ensuciaría el histórico del taller.
  const { COD_RPS_POR_OPERARIO } = await import("@/lib/server/operarios");
  const operarioRps = COD_RPS_POR_OPERARIO[operarioId];
  if (!operarioRps)
    return NextResponse.json(
      { error: `${operarioId} no tiene código de operario en RPS` },
      { status: 400 },
    );

  try {
    const { estadoDeFase, maquinaDeFase, moverFase } = await import("@/lib/server/olanet");

    // Se RELEE lo que hay ahora, no se cree lo que mande el navegador. Entre
    // que la ficha pintó el botón y alguien lo pulsa pueden pasar minutos: la
    // fase puede haberse cerrado desde el taller, o haberla retirado OLANET.
    const maquina = await maquinaDeFase(idBoletin);
    if (maquina === null)
      return NextResponse.json({ error: "Esa fase ya no existe en OLANET" }, { status: 404 });
    // La comprobación de que es de OT vive AQUÍ además de en la interfaz: el
    // botón no se ofrece sobre una fase de taller, pero esto escribe en el
    // sistema de la fábrica y la regla no puede depender de que nadie llame a
    // la ruta a mano.
    if (!esFaseDeOT(maquina))
      return NextResponse.json(
        { error: `Esa fase es de ${maquina}, no de Oficina Técnica` },
        { status: 403 },
      );

    const estado = await estadoDeFase(idBoletin);
    if (estado === ESTADO_OF.finalizada)
      // No es un error: alguien se te adelantó. Se contesta 200 para que la
      // ficha simplemente deje de ofrecerla.
      return NextResponse.json({ ok: true, yaEstaba: true });
    if (situacionDe(estado ?? -1) !== "sin_finalizar")
      return NextResponse.json(
        { error: "Esa fase no se puede finalizar desde aquí" },
        { status: 409 },
      );

    // Con la fecha de HOY, decidido con Iván: el movimiento dice la verdad
    // sobre quién la cerró y cuándo. Retrodatarlo dejaría en el histórico un
    // apunte que nunca ocurrió ese día, y hay fases de 2020.
    await moverFase({
      idBoletin,
      estado: ESTADO_OF.finalizada,
      operarioRps,
      cuando: new Date(),
    });
    return NextResponse.json({ ok: true, yaEstaba: false });
  } catch (e) {
    console.warn("[coordina] no se pudo finalizar la fase:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo escribir en OLANET" }, { status: 503 });
  }
}
