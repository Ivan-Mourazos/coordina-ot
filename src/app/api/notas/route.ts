import { NextResponse } from "next/server";
import { NOTA_MAX, validarTexto } from "@/lib/nota-pedido";
import { borrarNota, crearNota, editarNota, leerNotas } from "@/lib/server/notas-db";
import { puedeEscribirNotas, veNotasInternas } from "@/lib/personas";
import { identidad, loginActivo, quienEs, soloConSesion } from "@/lib/server/sesion";

// ─── /api/notas ──────────────────────────────────────────────────────────────
// El hilo de notas de un pedido. Cuatro verbos en un fichero, como hace
// /api/fichaje: son la misma cosa vista de cuatro maneras y separarlos en rutas
// anidadas solo repartiría la validación.
//
// El hilo NO viaja en el tablero: se pide al abrir el pedido. El tablero se
// refresca cada 30 s con 81 pedidos y mandar los hilos en cada vuelta sería
// peso muerto.
//
// Quién manda cada verbo lo decide identidad(): con el login encendido, la
// sesión; apagado, el `operarioId` del cuerpo, como hasta ahora. Editar y
// borrar comprueban ADEMÁS la propiedad en la sentencia SQL: eso para el
// accidente aunque la identidad venga bien firmada (editar la nota de otro
// sigue sin ser cosa de la ruta).
//
// Producción (Belén, 10/11/2026) también escribe: es como se comunica con OT.
// Pero LEE solo las notas «para todos» y las suyas, no las internas de OT.
// Eso lo decide el servidor, no la pantalla.

export const dynamic = "force-dynamic";

/** Un código de pedido cabe de sobra: "AR.26.03914" son 11 caracteres y el
 *  sintético de una OF suelta ronda los 12. El tope está para que no entre un
 *  texto entero por el sitio de la clave. */
const PEDIDO_MAX = 60;

const noJson = () => NextResponse.json({ error: "JSON inválido" }, { status: 400 });

async function cuerpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b: unknown = await req.json();
    // Un JSON que no sea objeto (el literal `null`, un número) parsea sin
    // error: sin esta guarda, leerle una propiedad reventaría con un 500.
    return typeof b === "object" && b !== null ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Cadena corta y no vacía, o null. Vale para el pedido y para el operario. */
const clave = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  // Recortada, como el texto: una clave de espacios no es una clave, y así no
  // se guarda una nota colgada de " AR.26.03914 ", que después no encontraría
  // nadie al leer el hilo por el código de verdad.
  const s = v.trim();
  return s.length > 0 && s.length <= PEDIDO_MAX ? s : null;
};

/** El 400 de un texto que no vale, con el motivo escrito: "no has puesto nada"
 *  y "te has pasado" se arreglan de formas distintas. */
function errorTexto(motivo: "vacio" | "largo") {
  return NextResponse.json(
    {
      error:
        motivo === "vacio"
          ? "La nota está vacía"
          : `La nota es demasiado larga: no puede pasar de ${NOTA_MAX} caracteres`,
    },
    { status: 400 },
  );
}

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;

  const pedido = clave(new URL(req.url).searchParams.get("pedido"));
  if (!pedido) return NextResponse.json({ error: "Falta pedido" }, { status: 400 });
  const yo = loginActivo() ? quienEs(req) : null;
  const soloPara = yo && !veNotasInternas(yo.roles) ? yo.id : undefined;
  return NextResponse.json(
    { notas: leerNotas(pedido, { soloPara }) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const b = await cuerpo(req);
  if (!b) return noJson();
  const pedido = clave(b.pedido);
  if (!pedido) return NextResponse.json({ error: "Falta pedido" }, { status: 400 });

  const yo = escritor(req, b.operarioId);
  if (yo instanceof NextResponse) return yo;

  const v = validarTexto(b.texto);
  if (!v.ok) return errorTexto(v.motivo);
  // Solo un `true` de verdad la abre: cualquier otra cosa, solo OT.
  return NextResponse.json({
    // Quien no es de OT (Producción) no escribe notas «solo OT»: las suyas
    // son siempre para todos (Iván, 10/11/2026). Lo decide el servidor.
    nota: crearNota(pedido, yo.id, v.texto, undefined, {
      publica: veNotasInternas(yo.roles) ? b.publica === true : true,
    }),
  });
}

/** Quién escribe, si puede escribir notas: técnicos y Producción. Dirección
 *  y supervisores puros siguen en solo lectura. */
function escritor(req: Request, operarioId: unknown) {
  const yo = identidad(req, operarioId);
  if (yo instanceof NextResponse) return yo;
  if (!puedeEscribirNotas(yo.roles))
    return NextResponse.json({ error: "Esta cuenta es de solo lectura" }, { status: 403 });
  return yo;
}

/** Id de una nota: entero, tal como lo devolvió el POST. */
const idDe = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) ? v : null;

export async function PATCH(req: Request) {
  const b = await cuerpo(req);
  if (!b) return noJson();
  const id = idDe(b.id);
  if (id === null) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  const yo = escritor(req, b.operarioId);
  if (yo instanceof NextResponse) return yo;

  const v = validarTexto(b.texto);
  if (!v.ok) return errorTexto(v.motivo);
  // 403 y no 404: desde fuera no se distingue "no era tuya" de "ya no está", y
  // decir cuál de las dos es sería contar algo de una nota que no es tuya.
  const publica = !veNotasInternas(yo.roles) ? true : typeof b.publica === "boolean" ? b.publica : undefined;
  return editarNota(id, yo.id, v.texto, undefined, publica)
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Esa nota no es tuya" }, { status: 403 });
}

export async function DELETE(req: Request) {
  const b = await cuerpo(req);
  if (!b) return noJson();
  const id = idDe(b.id);
  if (id === null) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  const yo = escritor(req, b.operarioId);
  if (yo instanceof NextResponse) return yo;

  return borrarNota(id, yo.id)
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Esa nota no es tuya" }, { status: 403 });
}
