import { NextResponse } from "next/server";
import { CAUSA_MAX, CAUSA_MIN, etiquetaValida } from "@/lib/devolucion";
import {
  crearCausaDevolucion,
  editarCausaDevolucion,
  leerCausasDevolucion,
  retirarCausaDevolucion,
} from "@/lib/server/estado-db";

// ─── /api/causas ─────────────────────────────────────────────────────────────
// Las causas por las que una OF vuelve al autor. La lista se crea sobre la
// marcha desde la propia devolución (ver lib/devolucion.ts), así que esto no es
// una pantalla de administración: es lo que necesita el cuadro de devolver para
// ofrecer las que hay y apuntar una nueva sin salir de ahí.
//
// Sin login, el `operarioId` lo manda el navegador, igual que en /api/notas y
// en el fichaje. Aquí solo sirve para dejar apuntado quién la creó.

export const dynamic = "force-dynamic";

const noJson = () => NextResponse.json({ error: "JSON inválido" }, { status: 400 });

async function cuerpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b: unknown = await req.json();
    return typeof b === "object" && b !== null ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** GET: las que se pueden elegir hoy. Con `?todas=1`, también las retiradas,
 *  que hacen falta para PINTAR una devolución vieja: su causa puede haberse
 *  retirado después y aun así hay que poder decir de qué fue. */
export async function GET(req: Request) {
  const todas = new URL(req.url).searchParams.get("todas") === "1";
  try {
    return NextResponse.json(
      { causas: leerCausasDevolucion(todas) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[causas] no se pudieron leer:", (e as Error).message);
    return NextResponse.json({ error: "No se pudieron leer las causas" }, { status: 500 });
  }
}

/** POST: crear una. Devuelve la causa creada O la que ya decía lo mismo —ver
 *  `crearCausaDevolucion`—, siempre con 200: que otro se te haya adelantado por
 *  segundos no es un error del que la escribe, y contárselo como tal le haría
 *  pensar que no se guardó. */
export async function POST(req: Request) {
  const b = await cuerpo(req);
  if (!b) return noJson();

  const etiqueta = typeof b.etiqueta === "string" ? b.etiqueta : "";
  if (!etiquetaValida(etiqueta))
    return NextResponse.json(
      {
        error:
          etiqueta.trim().length < CAUSA_MIN
            ? "La causa es demasiado corta"
            : `La causa es demasiado larga: no puede pasar de ${CAUSA_MAX} caracteres`,
      },
      { status: 400 },
    );

  const operarioId = typeof b.operarioId === "string" && b.operarioId ? b.operarioId : null;
  try {
    return NextResponse.json({
      causa: crearCausaDevolucion(etiqueta, operarioId, {
        familia: typeof b.familia === "string" ? b.familia : null,
        mira: typeof b.mira === "string" ? b.mira : null,
      }),
    });
  } catch (e) {
    console.error("[causas] no se pudo crear:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo crear la causa" }, { status: 500 });
  }
}

/** PATCH: retirar una causa (o devolverla al servicio), y editarla.
 *
 *  Dos cosas en el mismo sitio porque son la misma fila y el mismo permiso.
 *  Manda `retirada` y se retira; manda `etiqueta`, `familia` o `mira` y se
 *  edita. No hay DELETE a propósito: las devoluciones guardan el id y borrarla
 *  las dejaría apuntando a la nada. */
export async function PATCH(req: Request) {
  const b = await cuerpo(req);
  if (!b) return noJson();

  const id = typeof b.id === "number" && Number.isInteger(b.id) ? b.id : null;
  if (id === null) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

  if (typeof b.retirada === "boolean") {
    try {
      if (!retirarCausaDevolucion(id, b.retirada))
        return NextResponse.json({ error: "Esa causa no existe" }, { status: 404 });
      return NextResponse.json({ ok: true });
    } catch (e) {
      console.error("[causas] no se pudo retirar:", (e as Error).message);
      return NextResponse.json({ error: "No se pudo cambiar la causa" }, { status: 500 });
    }
  }

  const edita =
    typeof b.etiqueta === "string" || "familia" in b || "mira" in b || typeof b.orden === "number";
  if (!edita)
    return NextResponse.json({ error: "No hay nada que cambiar" }, { status: 400 });

  // La etiqueta se valida igual que al crear: es la que se cuenta en las
  // métricas y la que lee el autor de la OF.
  if (typeof b.etiqueta === "string" && !etiquetaValida(b.etiqueta))
    return NextResponse.json(
      {
        error:
          b.etiqueta.trim().length < CAUSA_MIN
            ? "La causa es demasiado corta"
            : `La causa es demasiado larga: no puede pasar de ${CAUSA_MAX} caracteres`,
      },
      { status: 400 },
    );

  try {
    const causa = editarCausaDevolucion(id, {
      ...(typeof b.etiqueta === "string" ? { etiqueta: b.etiqueta } : {}),
      ...("familia" in b ? { familia: typeof b.familia === "string" ? b.familia : null } : {}),
      ...("mira" in b ? { mira: typeof b.mira === "string" ? b.mira : null } : {}),
      ...(typeof b.orden === "number" ? { orden: b.orden } : {}),
    });
    if (!causa)
      // O no existe, o el texto nuevo choca con otra causa. Se dice lo segundo
      // porque es lo que pasa de verdad: el id sale de la propia lista.
      return NextResponse.json(
        { error: "Ya hay otra causa que dice lo mismo" },
        { status: 409 },
      );
    return NextResponse.json({ causa });
  } catch (e) {
    console.error("[causas] no se pudo editar:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo cambiar la causa" }, { status: 500 });
  }
}
