"use client";

// ─── Hablar con /api/causas desde el navegador ───────────────────────────────
// Aparte del componente porque lo usan dos: el cuadro de devolver (para
// ofrecerlas y crear una nueva) y quien tenga que PINTAR una devolución vieja,
// que necesita también las retiradas para poder decir de qué fue.

export interface CausaDevolucion {
  id: number;
  etiqueta: string;
  retirada: boolean;
  /** De qué trabajo es (código de familia de RPS). null = de todas. */
  familia: string | null;
  /** La misma causa en positivo, para la guía. null = no sale en la guía. */
  mira: string | null;
  orden: number;
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
  extras: { familia?: string | null; mira?: string | null } = {},
): Promise<CausaDevolucion | null> {
  try {
    const r = await fetch("/api/causas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etiqueta, operarioId, ...extras }),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { causa?: CausaDevolucion };
    return d.causa ?? null;
  } catch {
    return null;
  }
}

/** Cambia el texto, la familia o la cara en positivo de una causa.
 *
 *  Devuelve la causa ya guardada, o el motivo por el que no se pudo: quien
 *  edita tiene que poder leer "ya hay otra que dice lo mismo" y arreglarlo, no
 *  quedarse mirando un formulario que no responde. */
export async function editarCausa(
  id: number,
  cambios: { etiqueta?: string; familia?: string | null; mira?: string | null; orden?: number },
): Promise<{ causa: CausaDevolucion } | { error: string }> {
  try {
    const r = await fetch("/api/causas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...cambios }),
    });
    const d = (await r.json()) as { causa?: CausaDevolucion; error?: string };
    if (!r.ok || !d.causa) return { error: d.error ?? "No se pudo guardar" };
    return { causa: d.causa };
  } catch {
    return { error: "No se pudo guardar" };
  }
}

/** Retira una causa o la devuelve al servicio. No hay borrar: las devoluciones
 *  guardan su id. */
export async function retirarCausa(id: number, retirada: boolean): Promise<boolean> {
  try {
    const r = await fetch("/api/causas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, retirada }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// ─── Pasos de revisión (/api/revision/pasos) ─────────────────────────────────
// Lo que se mira al revisar, aparte de las causas desde el 11/10/2026: cada
// paso apunta a la causa que se marca si falla.

export interface PasoRevision {
  id: number;
  texto: string;
  /** Código de familia de RPS. null = para todos los pedidos. */
  familia: string | null;
  causaId: number;
  orden: number;
  retirado: boolean;
}

/** Los pasos en servicio; con `todos`, también los retirados. Si falla, lista
 *  vacía: sin guía se puede revisar igual, y no se rompe el cajón por ella. */
export async function leerPasos(todos = false): Promise<PasoRevision[]> {
  try {
    const r = await fetch(`/api/revision/pasos${todos ? "?todos=1" : ""}`, { cache: "no-store" });
    if (!r.ok) return [];
    const d = (await r.json()) as { pasos?: PasoRevision[] };
    return d.pasos ?? [];
  } catch {
    return [];
  }
}

async function mandarPaso(method: "POST" | "PATCH", body: object): Promise<{ paso: PasoRevision } | { error: string }> {
  try {
    const r = await fetch("/api/revision/pasos", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = (await r.json()) as { paso?: PasoRevision; error?: string };
    if (!r.ok || !d.paso) return { error: d.error ?? "No se pudo guardar" };
    return { paso: d.paso };
  } catch {
    return { error: "No se pudo guardar" };
  }
}

export const crearPaso = (texto: string, causaId: number, familia: string | null, operarioId: string | null) =>
  mandarPaso("POST", { texto, causaId, familia, operarioId });

export const editarPaso = (
  id: number,
  cambios: { texto?: string; familia?: string | null; causaId?: number; orden?: number; retirado?: boolean },
) => mandarPaso("PATCH", { id, ...cambios });
