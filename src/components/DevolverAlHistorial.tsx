"use client";

import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

// ─── "Devolver al Historial" ─────────────────────────────────────────────────
// El camino de vuelta de "Volver a plantear el pedido" (RecuperarPedido). Se
// pidió para el recuperado que luego resulta detenido: parado no se puede
// pasar, y se quedaba ocupando el panel (21/10/2026). Solo en pedidos
// recuperados: uno reabierto por una OF nueva tiene trabajo de verdad.

export function DevolverAlHistorial({
  pedido,
  seccion,
  miId,
  onDevuelto,
}: {
  pedido: string;
  seccion: string;
  miId: string | null;
  /** El servidor ya lo devolvió: la ficha se cierra y el panel deja de
   *  enseñarlo en cuanto se refresque. */
  onDevuelto: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch(`/api/historial/${pedido}/devolver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seccion, operarioId: miId }),
      });
      const d = (await r.json().catch(() => null)) as { ok?: true; error?: string } | null;
      if (!r.ok || !d?.ok) {
        setError(d?.error ?? "No se ha podido devolver el pedido al Historial.");
        return;
      }
      setAbierto(false);
      onDevuelto();
    } catch {
      setError("No se ha podido devolver el pedido al Historial. Comprueba la conexión.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setAbierto(true);
        }}
        title="Deshace «Volver a plantear el pedido»: sale del panel y vuelve al Historial como estaba"
        className="chip-3d mb-2 w-full rounded-lg px-3 py-2 text-xs font-semibold text-text"
      >
        ↩ Devolver al Historial
      </button>
      <ConfirmDialog
        abierto={abierto}
        titulo={`Devolver ${pedido} al Historial`}
        tono="neutra"
        textoConfirmar={enviando ? "Devolviendo…" : "Devolver al Historial"}
        mensaje={
          <div className="space-y-2">
            <p>
              Deshace «Volver a plantear el pedido»: sale del panel y sus OF vuelven como estaban al
              pasarlo, con su autor y su revisor.
            </p>
            <p>
              El tiempo que se haya fichado se conserva, y quien esté fichando en él deja de hacerlo.
              En RPS y OLANET no se toca nada.
            </p>
            {error && (
              <p className="text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}
          </div>
        }
        onConfirmar={() => void confirmar()}
        onCancelar={() => setAbierto(false)}
      />
    </>
  );
}
