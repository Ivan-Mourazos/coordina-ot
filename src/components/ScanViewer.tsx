"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Pedido } from "@/lib/types";
import { PedidoScan } from "./PedidoScan";

/** Visor a pantalla completa del pedido original. Hoy muestra la réplica
 *  dibujada; cuando RPS dé `scanUrl` mostrará la imagen real, y si la URL es
 *  un PDF lo abre embebido a página completa. Cierra con Escape, clic fuera
 *  o el aspa. */
export function ScanViewer({ pedido, onClose }: { pedido: Pedido; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const esPdf = pedido.scanUrl?.toLowerCase().endsWith(".pdf") ?? false;

  return createPortal(
    <div className="overlay-in fixed inset-0 z-[80] bg-black/60 backdrop-blur-md" onClick={onClose}>
      {/* barra superior */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-3 p-4 text-white">
        <span className="font-mono text-sm font-bold">{pedido.codigo}</span>
        <span className="text-sm text-white/70">{pedido.cliente}</span>
        {pedido.scanUrl && (
          <a
            href={pedido.scanUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto ml-auto rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
          >
            Abrir original ↗
          </a>
        )}
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className={`pointer-events-auto grid size-9 place-items-center rounded-lg bg-white/10 text-lg hover:bg-white/20 ${
            pedido.scanUrl ? "" : "ml-auto"
          }`}
        >
          ✕
        </button>
      </div>

      {/* hoja */}
      <div className="grid h-full place-items-center p-10" onClick={onClose}>
        {esPdf ? (
          <iframe
            src={pedido.scanUrl}
            title={`Pedido ${pedido.codigo}`}
            onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-5xl rounded-xl bg-white shadow-2xl"
          />
        ) : (
          <div
            onClick={(e) => e.stopPropagation()}
            className="aspect-[210/297] h-full max-h-full overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-white/20"
          >
            <PedidoScan pedido={pedido} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
