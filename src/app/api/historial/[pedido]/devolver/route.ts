import { NextResponse } from "next/server";
import { CODIGO_PEDIDO_RE } from "@/lib/historial";
import { identidad } from "@/lib/server/sesion";
import { esSeccionId } from "@/lib/secciones";
import { seccionDeOperario } from "@/lib/server/operarios";
import {
  guardarMutacion,
  leerOfsRetenidas,
  leerOverlay,
  leerPedidosPasados,
  previosDeRecuperacion,
} from "@/lib/server/estado-db";
import { cortarFichajeDeOF } from "@/lib/server/fichaje-db";
import { invalidarCacheTablero } from "@/lib/server/rps";
import type { CambioOF } from "@/lib/server/overlay";

// ─── /api/historial/[pedido]/devolver ────────────────────────────────────────
// Deshace "Volver a plantear el pedido": el pedido sale del panel y vuelve al
// Historial como estaba. Hacía falta para el pedido recuperado que luego
// resulta detenido (AR.26.04890, 21/10/2026): con todas sus OF detenidas
// queda «Parado por Producción», no se puede pasar, y se quedaba en el panel
// sin nada que hacer con él.
//
// Solo escribe en CoordinaOT: ni RPS ni OLANET. Por eso no repite nada de lo
// que hace el pase de verdad (finalizar en OLANET, imprimir, correo).

export const dynamic = "force-dynamic";

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

  try {
    // Solo un pedido recuperado y sin pasar otra vez: pasarlo borra sus filas
    // de `of_retenida`, así que si siguen ahí es que no se ha pasado.
    const retenidas = leerOfsRetenidas(seccionId).filter(
      (r) => r.pedido === pedido && (r.motivo === "recuperada" || r.motivo === "del_pedido"),
    );
    const paso = leerPedidosPasados(seccionId).get(pedido);
    if (!paso || !retenidas.some((r) => r.motivo === "recuperada"))
      return NextResponse.json({ error: "Este pedido no está recuperado del Historial." }, { status: 409 });

    const ofIds = retenidas.map((r) => r.ofId);
    const previos = previosDeRecuperacion(ofIds);
    const overlay = leerOverlay(seccionId);
    // Cada OF vuelve como estaba antes de recuperarla. Lo que no sea anulada
    // queda aprobada: es como estaba al pasarse, y cualquier otro estado
    // volvería a sacar el pedido del Historial (`pendienteDeOT` en overlay.ts).
    const cambiosOF: CambioOF[] = ofIds.map((ofId) => {
      const antes = previos.get(ofId);
      const ahora = overlay.ofs.get(ofId);
      return {
        ofId,
        autorId: antes?.autorId ?? ahora?.autorId ?? null,
        revisorId: antes?.revisorId ?? ahora?.revisorId ?? null,
        estado: antes?.estado === "anulada" ? "anulada" : "aprobada",
        observacion: antes?.observacion ?? ahora?.observacion ?? null,
        cerradaRps: null,
      };
    });
    const previosOF = ofIds
      .map((id) => overlay.ofs.get(id))
      .filter((x): x is NonNullable<typeof x> => x !== undefined);

    // Se marca pasado OTRA VEZ, con la hora de ahora: las OF se acaban de
    // tocar, y con la hora del pase antiguo `aplicarOverlay` lo daría por
    // reabierto. La lista de OF es la del pase original. Esto también borra
    // las filas de `of_retenida` del pedido.
    guardarMutacion({
      operarioId,
      motivo: "devolver_al_historial",
      seccion: seccionId,
      cambiosOF,
      previosOF,
      completarPedidoId: pedido,
      ofIdsPedido: paso.ofIds ? [...paso.ofIds] : undefined,
    });

    // Quien estuviera fichando en alguna se queda sin ella: se cierra su
    // tramo con la hora del servidor, igual que al pasar el pedido.
    const ahora = new Date().toISOString();
    for (const ofId of ofIds) {
      try {
        cortarFichajeDeOF(ofId, ahora);
      } catch (e) {
        console.error("[historial] no se pudo cortar el fichaje de la OF", ofId, ":", e);
      }
    }

    invalidarCacheTablero(seccionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[historial] devolver al Historial falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo devolver el pedido al Historial." }, { status: 500 });
  }
}
