import { NextResponse } from "next/server";
import { CODIGO_PEDIDO_RE } from "@/lib/historial";
import { documentosDePedido } from "@/lib/server/historial-db";

// ─── GET /api/pedidos/AR.26.04116/documentos ─────────────────────────────────
// Lo que RPS tiene colgado de un pedido: la rotulación, el planteamiento, el
// presupuesto, las fotos del trabajo y el adjunto de cada OF.
//
// POR QUÉ NO VALÍA LA DEL HISTORIAL. La lista ya existía, pero solo dentro del
// detalle del Historial —o sea, cuando el pedido ya está cerrado—. Y esos
// documentos hacen falta MIENTRAS se trabaja el pedido: la rotulación es lo que
// hay que mirar para plantearla, no un recuerdo de lo que se hizo. En Diseño
// Gráfico eso es la mitad del trabajo (las rotulaciones son 122 000 de los
// enlaces de RPS).
//
// VA APARTE DEL TABLERO A PROPÓSITO. El tablero lo pintan 56 pedidos cada 30 s
// y esta consulta toca dos tablas grandes por pedido; metida ahí serían 56
// consultas por vuelta para algo que solo se mira al abrir una ficha. Aquí se
// pide una vez, al abrirla.
//
// Los ficheros NO se sirven desde aquí: cada documento trae la URL de
// /api/historial/[pedido]/documento/[indice], que es quien resuelve el índice
// contra el share con todas sus comprobaciones. Se reutiliza tal cual —y no se
// duplica— porque el índice de esa URL es la POSICIÓN en esta misma lista: dos
// listas distintas servirían ficheros cruzados.

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ archivo: string }> },
) {
  // El segmento se llama `archivo` porque lo comparte con la ruta hermana que
  // sirve el PDF escaneado (/api/pedidos/AR.26.04116.pdf): Next no admite dos
  // nombres distintos de parámetro en el mismo nivel. Aquí es un CÓDIGO de
  // pedido, y como tal se valida.
  const { archivo: pedido } = await params;
  if (!CODIGO_PEDIDO_RE.test(pedido)) {
    return NextResponse.json({ error: "Código de pedido no válido" }, { status: 400 });
  }

  try {
    return NextResponse.json(
      { documentos: await documentosDePedido(pedido) },
      // Los documentos de un pedido cambian poco, pero cambian: se cuelga una
      // foto nueva y hay que verla. Sin caché de navegador; ya se pide una sola
      // vez por apertura de ficha.
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[pedidos] documentos: RPS falló:", (e as Error).message);
    // Un fallo aquí no puede romper la ficha: quien la abrió quiere trabajar,
    // y los documentos son un extra. El cliente lo enseña como "no se pudieron
    // cargar" y el resto de la ficha sigue en pie.
    return NextResponse.json({ error: "No se pudieron cargar los documentos" }, { status: 500 });
  }
}
