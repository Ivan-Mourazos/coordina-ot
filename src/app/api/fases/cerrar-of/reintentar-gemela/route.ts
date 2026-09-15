import { NextResponse } from "next/server";
import { identidad } from "@/lib/server/sesion";
import { getTablero } from "@/lib/data";
import { aplicarOverlay } from "@/lib/server/overlay";
import { leerOverlay, guardarMutacion } from "@/lib/server/estado-db";
import { esSeccionId, esFaseDe, SECCIONES, type SeccionId } from "@/lib/secciones";
import { seccionDeOperario, COD_RPS_POR_OPERARIO } from "@/lib/server/operarios";
import { empezarCierreOF, terminarCierreOF } from "@/lib/server/cierre-of-en-curso";
import type { EstadoOF } from "@/lib/types";

// ─── POST /api/fases/cerrar-of/reintentar-gemela ─────────────────────────────
// «Reintentar la N»: spec 2026-09-15-material-gastado-y-cerrar-of-design.md,
// «Confirmado con Iván» punto 4. Cuando «Dar por terminada en RPS» cierra la
// operación de la fila pero la gemela de la trampa 2/02 falla, la OF queda
// marcada (cerradaRps) sin ofrecer el cierre otra vez — accionesDisponibles
// ya no lo permite con la marca puesta. Esta ruta escribe SOLO esa gemela,
// con las mismas reglas que el cierre: autor, modoFichaje(), tiempo antes que
// la escritura, y relectura del estado justo antes de escribir.
//
// A diferencia de POST /api/fases/cerrar-of, aquí NO se corta ningún fichaje
// ni se drena la cola por su cuenta: la OF ya está cerrada y no es fichable
// (ver esFichable), así que no puede haber tiempo nuevo suyo desde entonces.
// Lo único que se comprueba es que lo de antes llegara.

export const dynamic = "force-dynamic";

const OF_ID_RE = /^\d{1,20}:[\w-]{1,20}$/;

export async function POST(req: Request) {
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (typeof cuerpo !== "object" || cuerpo === null)
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const b = cuerpo as Record<string, unknown>;
  const ofId = typeof b.ofId === "string" && OF_ID_RE.test(b.ofId) ? b.ofId : null;
  if (!ofId) return NextResponse.json({ error: "Falta ofId" }, { status: 400 });

  const yo = identidad(req, b.operarioId, "tecnico");
  if (yo instanceof NextResponse) return yo;
  const operarioId = yo.id;
  const operarioRps = COD_RPS_POR_OPERARIO[operarioId];
  if (!operarioRps)
    return NextResponse.json({ error: `${operarioId} no tiene código de operario en RPS` }, { status: 400 });

  const seccionId = esSeccionId(b.seccion) ? b.seccion : seccionDeOperario(operarioId);

  const base = await getTablero(seccionId);
  const tablero = aplicarOverlay(base, leerOverlay(seccionId));
  let of: (typeof tablero.pedidos)[number]["ofs"][number] | undefined;
  for (const p of tablero.pedidos) {
    const encontrada = p.ofs.find((o) => o.id === ofId);
    if (encontrada) {
      of = encontrada;
      break;
    }
  }
  if (!of) return NextResponse.json({ error: "OF no encontrada" }, { status: 404 });
  if (of.autorId !== operarioId)
    return NextResponse.json({ error: "Solo el autor puede reintentar esta operación." }, { status: 403 });
  if (!of.cerradaRps)
    return NextResponse.json({ error: "Esta OF no está cerrada en RPS." }, { status: 409 });
  const gemela = of.cerradaRps.gemelaSinEscribir;
  if (!gemela)
    return NextResponse.json({ error: "No hay ninguna operación pendiente de reintentar en esta OF." }, { status: 409 });

  if (!empezarCierreOF(ofId))
    return NextResponse.json({ error: "Esta OF ya se está dando por terminada en RPS; espera a que acabe." }, { status: 409 });
  try {
    return await reintentar({ ofId, operarioId, operarioRps, seccionId, of, gemela });
  } finally {
    terminarCierreOF(ofId);
  }
}

async function reintentar({
  ofId, operarioId, operarioRps, seccionId, of, gemela,
}: {
  ofId: string;
  operarioId: string;
  operarioRps: string;
  seccionId: SeccionId;
  of: {
    estado: EstadoOF;
    autorId: string | null;
    revisorId: string | null;
    observacion?: string;
    cerradaRps?: { at: string; por: string; modo: "sombra" | "ensayo" | "activo" };
  };
  gemela: string;
}): Promise<NextResponse> {
  const seccion = SECCIONES[seccionId];
  const [orden, tareaFila] = ofId.split(":");

  const { modoFichaje, sinLlegarAOlanet } = await import("@/lib/server/olanet-outbox");
  const modo = modoFichaje();
  if (modo !== "activo")
    return NextResponse.json(
      { error: "En modo sombra o ensayo no se escribe en RPS: no hay nada que reintentar todavía." },
      { status: 409 },
    );

  // El tiempo antes que la escritura, igual que al cerrar: si algo de esta OF
  // sigue sin llegar a OLANET (pendiente o descartado), no se toca la gemela.
  const tiempoQueFalta = () => {
    const { pendientes, descartados } = sinLlegarAOlanet(orden, tareaFila);
    if (descartados > 0)
      return NextResponse.json(
        {
          error: "RPS rechazó tiempo fichado en esta OF y no ha llegado a subir. No se ha escrito nada. Hay que revisar ese tiempo: avisa a quien lleva CoordinaOT.",
          descartado: true,
        },
        { status: 409 },
      );
    if (pendientes > 0)
      return NextResponse.json(
        { error: "Queda tiempo de esta OF por subir a RPS y ahora no entra. Vuelve a probar en unos minutos." },
        { status: 409 },
      );
    return null;
  };
  const falta = tiempoQueFalta();
  if (falta) return falta;

  const limpiarMarca = (mensajeExtra: Record<string, unknown> = {}) => {
    guardarMutacion({
      operarioId,
      motivo: "reintentar_gemela_cierre",
      seccion: seccionId,
      cambiosOF: [{
        ofId, autorId: of.autorId, revisorId: of.revisorId, estado: of.estado,
        observacion: of.observacion ?? null,
        cerradaRps: of.cerradaRps ? { ...of.cerradaRps, gemelaSinEscribir: undefined } : null,
      }],
    });
    if (process.env.DATASOURCE === "rps") {
      import("@/lib/server/rps")
        .then((rps) => rps.invalidarCacheTablero(seccionId))
        .catch((e) => console.warn("[coordina] no se pudo refrescar la caché del tablero:", (e as Error).message));
    }
    return NextResponse.json({ ok: true, ...mensajeExtra });
  };

  try {
    // Relee el estado antes de escribir: `buscarIdBoletin` trae el boletín TAL
    // CUAL lo tiene OLANET ahora, no el de cuando se cerró la fila.
    const { buscarIdBoletin, finalizarFase } = await import("@/lib/server/olanet");
    const idBoletin = await buscarIdBoletin(orden, gemela);
    if (idBoletin === null) {
      // RPS ya no tiene esa operación: no hay nada que reintentar, y decirlo
      // no es un fallo — se limpia la marca igual que si se hubiera escrito.
      return limpiarMarca({ resuelta: true, yaEstaba: false });
    }
    const r = await finalizarFase({
      idBoletin, of: orden, fase: gemela,
      esNuestra: (m) => esFaseDe(m, seccion), operarioRps, cuando: new Date(),
    });
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    return limpiarMarca({ yaEstaba: r.yaEstaba });
  } catch (e) {
    console.warn("[coordina] no se pudo reintentar la gemela en RPS:", (e as Error).message);
    return NextResponse.json(
      { error: "No se ha podido escribir en RPS. La operación sigue pendiente de reintentar." },
      { status: 503 },
    );
  }
}
