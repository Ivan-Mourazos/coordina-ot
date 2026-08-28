import { NextResponse } from "next/server";
import { NOVEDADES } from "@/lib/novedades";
import { fechasDeNovedades } from "@/lib/server/estado-db";

// ─── /api/novedades ──────────────────────────────────────────────────────────
// Solo las FECHAS. El contenido del log viaja con la app —está escrito en
// lib/novedades.ts y se despliega con ella—, así que mandarlo otra vez por aquí
// sería el mismo texto dos veces.
//
// Y son fechas de SALIDA, no de escritura: se sellan la primera vez que el
// servidor arranca con esa entrada dentro (ver `fechasDeNovedades`).

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(
      {
        // Solo las que NO traen fecha propia. Las de antes de este log la
        // llevan escrita —sacada del historial de cambios— y sellarlas ahora
        // guardaria en la base una fecha de salida que no fue la suya.
        fechas: fechasDeNovedades(NOVEDADES.filter((n) => !n.fecha).map((n) => n.id)),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    // Sin fechas el log se sigue leyendo: lo que importa es qué cambió, y la
    // fecha es el adorno. Se devuelve vacío en vez de un error.
    console.error("[novedades] no se pudieron sellar:", (e as Error).message);
    return NextResponse.json({ fechas: {} });
  }
}
