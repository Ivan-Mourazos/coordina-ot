"use client";

// ─── Hablar con /api/causas desde el navegador ───────────────────────────────
// Aparte del componente porque lo usan dos: el cuadro de devolver (para
// ofrecerlas y crear una nueva) y quien tenga que PINTAR una devolución vieja,
// que necesita también las retiradas para poder decir de qué fue.

export interface CausaDevolucion {
  id: number;
  etiqueta: string;
  retirada: boolean;
}

/** Las causas que se pueden elegir. Con `todas`, también las retiradas.
 *
 *  Si falla, lista vacía y a seguir: sin causas la devolución todavía se puede
 *  hacer —la nota es lo obligatorio—, y dejar el cuadro roto por no poder
 *  pintar unas píldoras sería peor que quedarse sin ellas. */
export async function leerCausas(todas = false): Promise<CausaDevolucion[]> {
  try {
    const r = await fetch(`/api/causas${todas ? "?todas=1" : ""}`, { cache: "no-store" });
    if (!r.ok) return [];
    const d = (await r.json()) as { causas?: CausaDevolucion[] };
    return d.causas ?? [];
  } catch {
    return [];
  }
}

/** Crea una causa y devuelve la que haya quedado.
 *
 *  Puede volver una que YA existía: si otro se adelantó por segundos, o si
 *  estaba retirada, el servidor devuelve esa misma en vez de duplicarla (ver
 *  `crearCausaDevolucion`). Para quien la escribió el resultado es el mismo, y
 *  es lo correcto: quería tenerla, y la tiene. */
export async function crearCausa(
  etiqueta: string,
  operarioId: string | null,
): Promise<CausaDevolucion | null> {
  try {
    const r = await fetch("/api/causas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etiqueta, operarioId }),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { causa?: CausaDevolucion };
    return d.causa ?? null;
  } catch {
    return null;
  }
}
