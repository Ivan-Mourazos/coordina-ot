"use client";

import { createPortal } from "react-dom";
import type { Pedido } from "@/lib/types";
import { PedidoScan } from "./PedidoScan";

const W = 400;
const H = Math.round(W * 1.414) + 34; // hoja + pie

/** Vista previa grande del parte al mantener el ratón encima (estilo
 *  Quick Look). Solo lectura: se posiciona junto a la tarjeta, sin robar
 *  el puntero (pointer-events none) para no interferir con drag ni clic. */
export function QuickLook({ pedido, anchor }: { pedido: Pedido; anchor: DOMRect }) {
  if (typeof document === "undefined") return null;

  const margin = 14;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // a la derecha de la tarjeta; si no cabe, a la izquierda
  const left =
    anchor.right + margin + W <= vw
      ? anchor.right + margin
      : Math.max(margin, anchor.left - margin - W);
  const top = Math.min(Math.max(margin, anchor.top - 40), Math.max(margin, vh - H - margin));

  return createPortal(
    <div
      className="quicklook fixed z-[70]"
      style={{ left, top, width: W }}
      aria-hidden
    >
      <div className="overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/10">
        <div style={{ height: Math.round(W * 1.414) }}>
          <PedidoScan pedido={pedido} />
        </div>
        <div className="flex items-center gap-2 border-t border-black/5 bg-[#faf8f3] px-3 py-2">
          <span className="font-mono text-xs font-bold text-[#3b3a36]">{pedido.codigo}</span>
          <span className="truncate text-xs text-[#8a877f]">{pedido.cliente}</span>
          <span className="ml-auto text-[10px] text-[#8a877f]">
            {pedido.ofs.length} OF
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
