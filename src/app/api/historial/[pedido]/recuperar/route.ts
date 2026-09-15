import { NextResponse } from "next/server";
import { CODIGO_PEDIDO_RE } from "@/lib/historial";
import { identidad, soloConSesion } from "@/lib/server/sesion";
import { seccionDe, esSeccionId } from "@/lib/secciones";
import { seccionDeOperario } from "@/lib/server/operarios";
import { ofsARecuperar } from "@/lib/server/recuperar-pedido";
import { leerEntregaPedido } from "@/lib/server/historial-db";
import { getTablero } from "@/lib/data";
import { aplicarOverlay } from "@/lib/server/overlay";
import { leerOverlay, leerOfsRetenidas, guardarMutacion } from "@/lib/server/estado-db";
import { invalidarCacheTablero } from "@/lib/server/rps";
import type { CambioOF } from "@/lib/server/overlay";

// ─── /api/historial/[pedido]/recuperar ───────────────────────────────────────
// GET: prepara la confirmación de "Volver a plantear el pedido" — qué OF
// volverían, si RPS deja fichar en cada una, y si el pedido ya se entregó.
// POST: lo ejecuta. Sección 3 de la spec del 15/09/2026.

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ pedido: string }> },
) {
  const corte = soloConSesion(req);
  if (corte) return corte;
  const { pedido } = await params;
  if (!CODIGO_PEDIDO_RE.test(pedido))
    return NextResponse.json({ error: "Código de pedido no válido" }, { status: 400 });

  try {
    const seccionId = seccionDe(new URL(req.url).searchParams.get("seccion")).id;
    const [ofs, entrega] = await Promise.all([
      ofsARecuperar(pedido, seccionId),
      leerEntregaPedido(pedido, seccionId),
    ]);
    return NextResponse.json(
      { ofs, entregado: !entrega.pendienteEntrega, fechaEntregado: entrega.fechaEntregado },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[historial] preparar recuperar falló:", (e as Error).message);
    return NextResponse.json({ error: "No se puede consultar RPS ahora mismo. No se ha tocado nada." }, { status: 503 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ pedido: string }> },
) {
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (typeof cuerpo !== "object" || cuerpo === null)
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const b = cuerpo as Record<string, unknown>;

  const { pedido } = await params;
  if (!CODIGO_PEDIDO_RE.test(pedido))
    return NextResponse.json({ error: "Código de pedido no válido" }, { status: 400 });

  const yo = identidad(req, b.operarioId, "tecnico");
  if (yo instanceof NextResponse) return yo;
  const operarioId = yo.id;
  const seccionId = esSeccionId(b.seccion) ? b.seccion : seccionDeOperario(operarioId);
  const marcadas = new Set(
    Array.isArray(b.ofIds) ? b.ofIds.filter((x): x is string => typeof x === "string" && x.length > 0) : [],
  );

  try {
    // 2. Si ya está en el panel y no completado, no se toca nada. Si ya se
    //    había recuperado, se contesta igual sin volver a escribir.
    const base = await getTablero(seccionId);
    const tablero = aplicarOverlay(base, leerOverlay(seccionId));
    const enPanel = tablero.pedidos.find((p) => p.codigo === pedido);
    if (enPanel && enPanel.situacion !== "completado")
      return NextResponse.json({ error: "Este pedido ya está en el panel." }, { status: 409 });
    if (leerOfsRetenidas(seccionId).some((r) => r.pedido === pedido && r.motivo === "recuperada"))
      return NextResponse.json({ ok: true, yaEstaba: true });

    // 3. Las OF que vuelven, y que las marcadas estén entre ellas.
    const todas = await ofsARecuperar(pedido, seccionId);
    const idsValidos = new Set(todas.map((o) => o.ofId));
    if (marcadas.size === 0 || ![...marcadas].every((id) => idsValidos.has(id)))
      return NextResponse.json({ error: "Selección de OF no válida." }, { status: 400 });

    // 4. En una transacción: los cambios de estado (tabla de la spec §3) y las
    //    filas de of_retenida.
    const overlay = leerOverlay(seccionId);
    const ahora = new Date().toISOString();
    const cambiosOF: CambioOF[] = todas.map((of) => {
      const previa = overlay.ofs.get(of.ofId);
      const marcada = marcadas.has(of.ofId);
      return {
        ofId: of.ofId,
        // El autor: primero la fila del overlay leída AHORA mismo (la fuente
        // más fresca); si no hay fila, lo que ya calculó `ofsARecuperar` (la
        // misma foto que vio quien confirma); si tampoco hay eso, sin autor.
        // Marcada sin autor: autor = quien recupera (decisión del 15/09/2026,
        // spec §3 "Qué estado toma cada OF"). Sin marcar y sin autor: sin
        // autor — deducirlo de RPS encendería "OF nueva" para nadie y no
        // aporta nada, ya que esa OF no bloquea el pedido al quedar aprobada.
        autorId: previa?.autorId ?? of.autorId ?? (marcada ? operarioId : null),
        revisorId: previa?.revisorId ?? null,
        estado: marcada ? "en_curso" : "aprobada",
        observacion: previa?.observacion ?? null,
        // Recuperar deja SIEMPRE sin la marca de cerrada: si el pedido llegó
        // hasta aquí, ya se pasó (eso borró of_retenida de su sección) y
        // "cerrada en RPS" no tiene sentido sobre una OF que se va a
        // replantear.
        cerradaRps: null,
      };
    });
    // Respaldo para las OF que RPS trae con autor propio (imputaciones) pero
    // que CoordinaOT nunca había tocado: sin esto el primer traspaso de una
    // de ellas no avisaría a nadie (ver comentario de `previosOF` en
    // `estado-db.ts`).
    const previosOF = todas
      .map((of) => overlay.ofs.get(of.ofId))
      .filter((x): x is NonNullable<typeof x> => x !== undefined);

    guardarMutacion({
      operarioId,
      motivo: "recuperar_pedido",
      seccion: seccionId,
      cambiosOF,
      previosOF,
      ofRetenida: todas.map((of) => ({
        ofId: of.ofId,
        pedido,
        por: operarioId,
        at: ahora,
        motivo: marcadas.has(of.ofId) ? "recuperada" : "del_pedido",
      })),
    });

    // 5. La consulta tarda de 7 a 15 s: se lanza el refresco sin esperarlo.
    invalidarCacheTablero(seccionId);

    return NextResponse.json({ ok: true, yaEstaba: false });
  } catch (e) {
    console.error("[historial] recuperar pedido falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo recuperar el pedido." }, { status: 500 });
  }
}
