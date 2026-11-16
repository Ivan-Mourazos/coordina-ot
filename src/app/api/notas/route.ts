import { NextResponse } from "next/server";
import { NOTA_MAX, esSeccionMencionable, validarTexto, type Destino } from "@/lib/nota-pedido";
import { borrarNota, crearNota, editarNota, leerNotas, marcarResuelta, pedidoDeNota, puedeVer } from "@/lib/server/notas-db";
import { puedeEscribirNotas } from "@/lib/personas";
import { leerPersonas } from "@/lib/server/personas-db";
import { lectorDePeticion } from "@/lib/server/lector-sesion";
import { identidad, soloConSesion } from "@/lib/server/sesion";

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
// Para quién es cada nota (16/11/2026, docs/NOTAS-MENCIONES.md): para todos
// por defecto, o «solo para» unas personas o secciones. Quién ve qué lo
// decide el servidor con la sesión (lectorDePeticion), en SQL; una nota que
// no ves no existe para ti, tampoco al editarla o borrarla.

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

/** El «para» del cuerpo: lista de destinos que existen, o null si algo no
 *  vale. Una persona tiene que ser una cuenta activa; una sección, una de las
 *  mencionables. Sin `para` (undefined) es «no lo dice». */
function leerPara(v: unknown): Destino[] | null | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > 50) return null;
  const personas = new Set(leerPersonas().map((p) => p.id));
  const salida: Destino[] = [];
  const vistos = new Set<string>();
  for (const d of v as unknown[]) {
    if (typeof d !== "object" || d === null) return null;
    const { tipo, id } = d as { tipo?: unknown; id?: unknown };
    if (typeof id !== "string") return null;
    let destino: Destino;
    if (tipo === "persona" && personas.has(id)) destino = { tipo: "persona", id };
    else if (tipo === "seccion" && esSeccionMencionable(id)) destino = { tipo: "seccion", id };
    else return null;
    const k = `${destino.tipo}:${destino.id}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    salida.push(destino);
  }
  return salida;
}

const errorPara = () => NextResponse.json({ error: "Ese destinatario no existe" }, { status: 400 });
const noExiste = () => NextResponse.json({ error: "Esa nota no existe" }, { status: 404 });

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;

  const pedido = clave(new URL(req.url).searchParams.get("pedido"));
  if (!pedido) return NextResponse.json({ error: "Falta pedido" }, { status: 400 });
  const lector = lectorDePeticion(req);
  return NextResponse.json(
    // `destinos`: para que el panel resalte las menciones que van contigo.
    { notas: leerNotas(pedido, lector), destinos: lector?.destinos ?? [] },
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
  const para = leerPara(b.para);
  if (para === null) return errorPara();
  // Respuesta: a una nota que ves y del mismo pedido. Si no, 404: de una nota
  // que no ves no se dice nada, ni que existe.
  let padreId: number | undefined;
  if (b.padreId !== undefined && b.padreId !== null) {
    const p = idDe(b.padreId);
    if (p === null || !puedeVer(p, lectorDePeticion(req)) || pedidoDeNota(p) !== pedido) return noExiste();
    padreId = p;
  }
  return NextResponse.json({
    // Solo un `true` de verdad la saca a la consulta pública. Una respuesta
    // ignora las dos cosas: hereda las de la raíz.
    nota: crearNota(pedido, yo.id, v.texto, undefined, {
      para: para ?? [],
      enConsultaPublica: b.enConsultaPublica === true,
      padreId,
    }),
  });
}

/** Quién escribe, si puede escribir notas: técnicos, Producción y Dirección.
 *  Supervisores puros siguen en solo lectura. */
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
  // Antes que la autoría: de una nota que no ves no se dice ni que es de otro.
  if (!puedeVer(id, lectorDePeticion(req))) return noExiste();

  // Dar por resuelta una conversación (o reabrirla): cualquiera que la vea,
  // no solo su autor. Solo la raíz.
  if (typeof b.resuelta === "boolean" && b.texto === undefined)
    return marcarResuelta(id, yo.id, b.resuelta)
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Solo se resuelve la nota que abre la conversación" }, { status: 400 });

  const v = validarTexto(b.texto);
  if (!v.ok) return errorTexto(v.motivo);
  const para = leerPara(b.para);
  if (para === null) return errorPara();
  // 403 y no 404: desde fuera no se distingue "no era tuya" de "ya no está", y
  // decir cuál de las dos es sería contar algo de una nota que no es tuya.
  return editarNota(id, yo.id, v.texto, undefined, {
    para,
    enConsultaPublica: typeof b.enConsultaPublica === "boolean" ? b.enConsultaPublica : undefined,
  })
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
  if (!puedeVer(id, lectorDePeticion(req))) return noExiste();

  return borrarNota(id, yo.id)
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Esa nota no es tuya" }, { status: 403 });
}
