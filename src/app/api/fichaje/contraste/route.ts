import { NextResponse } from "next/server";
import { MAQUINA_OT, claveBonoRps, type FilaBono } from "@/lib/bonos";
import { contrastar, veredicto } from "@/lib/contraste";
import { leerBonosDe } from "@/lib/server/contraste-db";
import { bonosTraspasados } from "@/lib/server/olanet";
import { leerCola, modoFichaje } from "@/lib/server/olanet-outbox";

// ─── /api/fichaje/contraste ──────────────────────────────────────────────────
// El informe que decide si se puede pasar el fichaje a `activo`: compara, día a
// día, lo que ha escrito CoordinaOT con lo que ha escrito la herramienta vieja
// en la MISMA tabla de OLANET. Ver lib/contraste.ts para el porqué de cada
// número.
//
//   ?dias=14 → cuántos días atrás mirar (por defecto 14, máximo 60).
//
// Solo lee. No sirve de nada en modo `sombra`: ahí no se escribe en OLANET, así
// que no hay nada que contrastar y se dice en vez de devolver ceros.

export const dynamic = "force-dynamic";

const DIAS_POR_DEFECTO = 14;
const DIAS_MAX = 60;

function haceDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const modo = modoFichaje();
  if (modo === "sombra") {
    return NextResponse.json(
      {
        modo,
        error:
          "En modo sombra no se escribe en OLANET: no hay nada que contrastar. Pon FICHAJE_OLANET=ensayo y deja pasar unos días de trabajo normal.",
      },
      { status: 409 },
    );
  }

  const pedidos = Number(new URL(req.url).searchParams.get("dias"));
  const dias = Number.isFinite(pedidos) && pedidos > 0 ? Math.min(pedidos, DIAS_MAX) : DIAS_POR_DEFECTO;
  const desde = haceDias(dias);

  // La cola es la lista de lo que CoordinaOT ha querido escribir. Se limita a
  // los bonos: los movimientos de fase no llevan tiempo y en ensayo ni salen.
  const nuestros = leerCola(5000)
    .filter((e) => e.tipo === "bono")
    .map((e) => e.datos as FilaBono)
    .filter((b) => b.ini >= desde);

  const nuestrosDias = [...new Set(nuestros.map((b) => b.ini))].sort();
  if (nuestrosDias.length === 0) {
    return NextResponse.json(
      {
        modo,
        desde,
        error: `Sin fichaje en CoordinaOT desde el ${desde}: no hay nada que contrastar.`,
      },
      { status: 404 },
    );
  }

  try {
    const enTabla = await leerBonosDe(nuestrosDias, MAQUINA_OT);
    const informe = contrastar(nuestros, enTabla);

    // El último tramo del circuito, y solo se puede ver en activo: si OLANET
    // está recogiendo nuestros bonos y subiéndolos a RPS. Ver `EstadoTraspaso`.
    if (modo === "activo") {
      const operarios = [...new Set(nuestros.map((b) => b.operario))];
      const yaEnRps = await bonosTraspasados(nuestrosDias, operarios, MAQUINA_OT);
      const subidos = nuestros.filter((b) => yaEnRps.has(claveBonoRps(b))).length;
      informe.traspaso = { subidos, pendientes: nuestros.length - subidos };
    }

    return NextResponse.json(
      { modo, desde, maquina: MAQUINA_OT, veredicto: veredicto(informe), ...informe },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    // Sin VPN o con OLANET caído esto no es un fallo del fichaje: es que no se
    // puede mirar ahora. Se dice, en vez de devolver un informe vacío que se
    // leería como "no hay descuadres".
    return NextResponse.json(
      {
        modo,
        error: `No se pudo leer OLANET: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 502 },
    );
  }
}
