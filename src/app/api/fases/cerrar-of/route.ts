import { NextResponse } from "next/server";
import { identidad } from "@/lib/server/sesion";
import { getTablero } from "@/lib/data";
import { aplicarOverlay } from "@/lib/server/overlay";
import { leerOverlay, guardarMutacion } from "@/lib/server/estado-db";
import { accionesDisponibles } from "@/lib/acciones";
import { esSeccionId, esFaseDe, SECCIONES, type SeccionId } from "@/lib/secciones";
import type { OF } from "@/lib/types";
import { seccionDeOperario, COD_RPS_POR_OPERARIO } from "@/lib/server/operarios";
import { finalizables, situacionDe } from "@/lib/fase-pendiente";
import { pedidoListoParaPasar } from "@/lib/fases-tablero";
import { cortarFichajeDeOFConAviso, leerTodosIntervalos, reencolarTramosDeOF } from "@/lib/server/fichaje-db";
import { empezarCierreOF, terminarCierreOF } from "@/lib/server/cierre-of-en-curso";

// ─── POST /api/fases/cerrar-of ───────────────────────────────────────────────
// «Dar por terminada en RPS» sobre una OF suelta, antes de pasar el pedido
// entero. Sección 2 de la spec 2026-09-15-material-gastado-y-cerrar-of-design:
// corta el fichaje, drena la cola de OLANET, cierra en RPS (solo en modo
// `activo`) y marca la OF en la misma transacción que la retiene en el
// tablero. ESCRIBE EN EL SISTEMA DE LA FÁBRICA: por eso se relee todo del
// servidor y no se confía en nada de lo que traiga el navegador salvo el id.
//
// La regla que manda: el tiempo antes que el cierre. Si no se puede garantizar
// que el tiempo de la OF está en OLANET, no se cierra.

export const dynamic = "force-dynamic";

const OF_ID_RE = /^\d{1,20}:[\w-]{1,20}$/;

const SIN_ESCRIBIR = "No se ha podido escribir en RPS. No se ha cerrado nada; el reloj sí se ha parado.";

interface Operacion {
  of: string;
  fase: string;
  ok: boolean;
  yaEstaba: boolean;
  error?: string;
  status?: number;
}

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

  // 1. Quién cierra lo decide identidad(), no el cuerpo: es lo que se firma
  //    en OLANET como autor del movimiento.
  const yo = identidad(req, b.operarioId, "tecnico");
  if (yo instanceof NextResponse) return yo;
  const operarioId = yo.id;
  const operarioRps = COD_RPS_POR_OPERARIO[operarioId];
  if (!operarioRps)
    return NextResponse.json({ error: `${operarioId} no tiene código de operario en RPS` }, { status: 400 });

  const seccionId = esSeccionId(b.seccion) ? b.seccion : seccionDeOperario(operarioId);

  // 2. Se relee el tablero con su overlay, como hace /api/estado. Nada de lo
  //    que sigue se fía del cuerpo salvo el ofId y el operarioId.
  const base = await getTablero(seccionId);
  const tablero = aplicarOverlay(base, leerOverlay(seccionId));
  let pedido: (typeof tablero.pedidos)[number] | undefined;
  let of: (typeof tablero.pedidos)[number]["ofs"][number] | undefined;
  for (const p of tablero.pedidos) {
    const encontrada = p.ofs.find((o) => o.id === ofId);
    if (encontrada) {
      pedido = p;
      of = encontrada;
      break;
    }
  }
  if (!of || !pedido) return NextResponse.json({ error: "OF no encontrada" }, { status: 404 });
  if (of.autorId !== operarioId)
    return NextResponse.json({ error: "Solo el autor puede cerrar esta OF en RPS." }, { status: 403 });
  if (!accionesDisponibles(of, null).some((a) => a.id === "cerrar_en_rps"))
    return NextResponse.json({ error: "Esta OF no se puede dar por terminada en RPS ahora mismo." }, { status: 409 });
  // Última OF que queda: si al aprobar ESTA no quedara nada más que hacer, es
  // "Pasar a Producción" lo que toca, no esto — ver ofsQueCuentan/
  // pedidoListoParaPasar en fases-tablero.ts.
  const laOF = of;
  const comoSiAprobada = { ...pedido, ofs: pedido.ofs.map((o) => (o.id === laOF.id ? { ...o, estado: "aprobada" as const } : o)) };
  if (pedidoListoParaPasar(comoSiAprobada))
    return NextResponse.json({ error: "Es la última OF pendiente del pedido: usa «Pasar a Producción»." }, { status: 409 });

  // 3. Candado de la OF mientras dura el cierre: nadie puede empezar a fichar
  //    en ella (POST /api/fichaje lo rechaza) ni cerrarla otra vez a la vez.
  //    Se pone ANTES del corte, para que no quepa un fichaje entre el corte y
  //    el 3. Se suelta pase lo que pase.
  if (!empezarCierreOF(ofId))
    return NextResponse.json({ error: "Esta OF ya se está dando por terminada en RPS; espera a que acabe." }, { status: 409 });
  try {
    return await cerrar({ ofId, operarioId, operarioRps, seccionId, of: laOF, pedido });
  } finally {
    terminarCierreOF(ofId);
  }
}

async function cerrar({
  ofId, operarioId, operarioRps, seccionId, of, pedido,
}: {
  ofId: string;
  operarioId: string;
  operarioRps: string;
  seccionId: SeccionId;
  of: OF;
  pedido: { codigo: string };
}): Promise<NextResponse> {
  const seccion = SECCIONES[seccionId];

  // 4. El tiempo antes que el cierre: se corta con la hora del servidor.
  const ahora = new Date().toISOString();
  const corte = cortarFichajeDeOFConAviso(ofId, ahora);

  const { modoFichaje, sinLlegarAOlanet } = await import("@/lib/server/olanet-outbox");
  const modo = modoFichaje();
  const operaciones: Operacion[] = [];
  let yaEstaba = false;
  let faseFila: string | null = null;
  let gemelasSinEscribir: string[] = [];
  const [orden, tareaFila] = ofId.split(":");

  const tiempoSinSubir = () =>
    NextResponse.json(
      { error: "Queda tiempo de esta OF por subir a RPS y ahora no entra. No se ha cerrado nada; el reloj sí se ha parado. Vuelve a probar en unos minutos." },
      { status: 409 },
    );
  /** ¿Está TODO el tiempo de la operación en OLANET? Si no, la respuesta que
   *  toca. Lo descartado va primero: no se arregla solo esperando. */
  const tiempoQueFalta = (): NextResponse | null => {
    const { pendientes, descartados } = sinLlegarAOlanet(orden, tareaFila);
    if (descartados > 0)
      return NextResponse.json(
        { error: "RPS rechazó tiempo fichado en esta OF y no ha llegado a subir. No se ha cerrado nada; el reloj sí se ha parado. Hay que revisar ese tiempo antes de darla por terminada: avisa a quien lleva CoordinaOT." },
        { status: 409 },
      );
    return pendientes > 0 ? tiempoSinSubir() : null;
  };

  if (modo === "activo") {
    // 5. Primero el reloj: si el tramo recién cortado no llegó a entrar en la
    //    cola, la comprobación de abajo la vería vacía y el 3 se escribiría
    //    sin ese tiempo.
    if (corte.sinEncolar.length > 0) return tiempoSinSubir();
    //    Y en un REINTENTO de eso el reloj ya estaba parado: el corte no
    //    encuentra nada que encolar, pero el tramo que no entró sigue fuera de
    //    la cola. Se vuelven a encolar los tramos cerrados de esta OF; lo que
    //    ya estaba (pendiente, enviado o descartado) se ignora por su clave.
    try {
      reencolarTramosDeOF(ofId);
    } catch (e) {
      console.warn("[coordina] no se pudo reencolar el tiempo de la OF:", (e as Error).message);
      return tiempoSinSubir();
    }
    try {
      const { drenarCola } = await import("@/lib/server/olanet-worker");
      const { fasesDeOFs, finalizarFase } = await import("@/lib/server/olanet");
      const { claveFase } = await import("@/lib/server/rps");

      // 6. Se drena la cola EN ORDEN (con su candado, Tarea 3) y se comprueba
      //    que no queda nada de esta operación sin llegar a OLANET: ni
      //    pendiente ni descartado. Se miran las líneas de tiempo además de
      //    los movimientos de fase: lo que tiene que estar antes del 3 es,
      //    sobre todo, el TIEMPO.
      await drenarCola();
      const falta = tiempoQueFalta();
      if (falta) return falta;

      // 7. Las operaciones de MI sección para esta orden — normalmente una,
      //    dos con la trampa 2/02 (finalizables ya filtra por sección, así
      //    que la gemela de otra sección no se toca).
      //
      //    La de la fila se busca por su código TAL CUAL: con la trampa 2/02,
      //    `claveFase` junta la "2" y la "02", y OLANET devuelve la "02"
      //    primero (ordena como texto). Solo si no hay coincidencia exacta y
      //    hay UNA sola candidata se acepta por `claveFase`: es el caso normal
      //    de RPS guardando "03" donde OLANET dice "3".
      const fases = await fasesDeOFs([orden]);
      const exacta = fases.find((f) => f.of === orden && f.fase === tareaFila);
      const parecidas = fases.filter((f) => claveFase(f.of, f.fase) === claveFase(orden, tareaFila));
      const filaPropia = exacta ?? (parecidas.length === 1 ? parecidas[0] : undefined);
      const situacionPropia = filaPropia ? situacionDe(filaPropia.estado) : "desconocida";
      if (!filaPropia || situacionPropia === "eliminada" || situacionPropia === "desconocida") {
        return NextResponse.json({ error: "RPS ya retiró esta operación; no hay nada que cerrar." }, { status: 409 });
      }
      faseFila = filaPropia.fase;

      const pendientesDeCerrar = finalizables(fases, seccion);
      // `finalizables` deja fuera la fila por dos motivos: que YA esté en 3, o
      // que su máquina no sea de esta sección. Solo lo primero es un éxito sin
      // escribir; lo segundo no se puede cerrar desde aquí, y se dice ANTES de
      // tocar la gemela.
      const laFilaSeCierra = pendientesDeCerrar.some((f) => f.of === filaPropia.of && f.fase === filaPropia.fase);
      if (!laFilaSeCierra && situacionPropia !== "finalizada") {
        return NextResponse.json(
          { error: `En RPS esta operación no es de ${seccion.nombre}: desde aquí no se puede dar por terminada. No se ha cerrado nada; el reloj sí se ha parado.` },
          { status: 409 },
        );
      }

      // 8. Justo antes del 3, otra vez: que nadie haya abierto reloj en la OF
      //    ni haya entrado tiempo suyo mientras se hablaba con OLANET. El
      //    candado para a la ruta de fichaje; esto cubre cualquier otro camino.
      if (leerTodosIntervalos().some((iv) => iv.fin === null && iv.ofIds.includes(ofId))) {
        return NextResponse.json(
          { error: "Alguien ha empezado a fichar en esta OF mientras se cerraba. No se ha cerrado nada; vuelve a pulsar cuando pare." },
          { status: 409 },
        );
      }
      const faltaAhora = tiempoQueFalta();
      if (faltaAhora) return faltaAhora;

      for (const f of pendientesDeCerrar) {
        const r = await finalizarFase({
          idBoletin: f.idBoletin, of: f.of, fase: f.fase,
          esNuestra: (m) => esFaseDe(m, seccion), operarioRps, cuando: new Date(),
        });
        operaciones.push({
          of: f.of, fase: f.fase, ok: r.ok,
          yaEstaba: r.ok ? r.yaEstaba : false,
          error: r.ok ? undefined : r.error,
          status: r.ok ? undefined : r.status,
        });
      }
      // La de la fila es la operación `filaPropia`, con su código tal cual: la
      // gemela 2/02 puede haber fallado sin que eso cambie la marca.
      const deLaFila = operaciones.find((o) => o.of === filaPropia.of && o.fase === filaPropia.fase);
      if (deLaFila && !deLaFila.ok) {
        // OLANET caído es 503, como cuando lanza; lo demás (ya no existe, no es
        // nuestra, estado raro) es un conflicto con lo que hay en RPS.
        return NextResponse.json(
          { error: deLaFila.error ?? SIN_ESCRIBIR, operaciones },
          { status: deLaFila.status === 503 ? 503 : 409 },
        );
      }
      // Sin `deLaFila`, la fila ya estaba en 3 (comprobado arriba).
      yaEstaba = deLaFila ? deLaFila.yaEstaba : true;
      gemelasSinEscribir = operaciones.filter((o) => o !== deLaFila && !o.ok).map((o) => o.fase);
    } catch (e) {
      console.warn("[coordina] no se pudo cerrar la OF en RPS:", (e as Error).message);
      // El corte del reloj ya estaba hecho y no se deshace, igual que en
      // "Pasar a Producción": volver a pulsar es seguro (idempotente).
      return NextResponse.json({ error: SIN_ESCRIBIR }, { status: 503 });
    }
  }
  // En sombra/ensayo: nada de lo anterior se ejecuta. `operaciones` queda
  // vacío y la marca se guarda con el modo, tal cual pide el paso 4 de la spec.

  // 9. Marca + fila retenida, en la MISMA transacción que el cambio a
  //    "aprobada".
  guardarMutacion({
    operarioId,
    motivo: "cerrar_en_rps",
    seccion: seccionId,
    cambiosOF: [{
      ofId, autorId: of.autorId, revisorId: of.revisorId, estado: "aprobada",
      observacion: of.observacion ?? null,
      // La gemela que no entró se guarda CON la marca (Confirmado con Iván,
      // punto 4): sin esto, «Reintentar la N» desaparecería al refrescar la
      // pantalla, porque solo vivía en la respuesta de este POST.
      // `gemelasSinEscribir` es un array por si acaso, pero la trampa 2/02
      // deja como mucho UNA gemela por sección.
      cerradaRps: { at: ahora, por: operarioId, modo, gemelaSinEscribir: gemelasSinEscribir[0] },
    }],
    previosOF: [{
      ofId, autorId: of.autorId, revisorId: of.revisorId, estado: of.estado,
      observacion: of.observacion ?? null,
    }],
    ofRetenida: { ofId, pedido: pedido.codigo, motivo: "cerrada", por: operarioId, at: ahora },
  });

  // 10. La OF retenida cambia lo que tiene que enseñar el tablero de la
  //     sección: sin esto, la caché seguiría sirviendo el de antes. Solo con
  //     RPS de verdad (con el mock no hay caché), y sin que un fallo aquí
  //     convierta en error un cierre que ya está hecho.
  if (process.env.DATASOURCE === "rps") {
    try {
      (await import("@/lib/server/rps")).invalidarCacheTablero(seccionId);
    } catch (e) {
      console.warn("[coordina] no se pudo refrescar la caché del tablero:", (e as Error).message);
    }
  }

  return NextResponse.json({ ok: true, modo, operaciones, yaEstaba, faseFila, gemelasSinEscribir });
}
