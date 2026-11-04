import { NextResponse } from "next/server";
import type { EstadoTrabajo, IdImpresora } from "@/lib/impresoras";
import { leerImpresionesRecientes, modoImpresion } from "@/lib/server/impresion-cola";
import { impresorasDeLaCasa, leerImpresoras } from "@/lib/server/impresoras";
import { soloConSesion } from "@/lib/server/sesion";

// ─── GET /api/impresoras ─────────────────────────────────────────────────────
// Cómo están las impresoras y qué ha mandado la web. Cada envío lleva, si se
// sabe, cómo va ese trabajo en la impresora: así se distingue «no se mandó» de
// «se mandó y sigue en cola» o «la impresora lo abortó». Solo lectura.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;

  const impresoras = await leerImpresoras();
  const idDe = new Map(impresorasDeLaCasa().map((i) => [i.uri, i.id]));
  const envios = leerImpresionesRecientes(40).map(({ trabajo, ...f }) => {
    const id: IdImpresora | null = f.impresora ? (idDe.get(f.impresora) ?? null) : null;
    const enImpresora = id && trabajo !== null ? impresoras.find((i) => i.id === id) : null;
    const t = enImpresora ? [...enImpresora.pendientes, ...enImpresora.recientes].find((x) => x.id === trabajo) : null;
    const estadoEnImpresora: EstadoTrabajo | null = t?.estado ?? null;
    return { ...f, impresoraId: id, estadoEnImpresora };
  });
  return NextResponse.json(
    { modo: modoImpresion(), impresoras, envios },
    { headers: { "Cache-Control": "no-store" } },
  );
}
