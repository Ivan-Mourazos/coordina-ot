"use client";

import { useState } from "react";

// ─── "Han vuelto a escanear el parte" ────────────────────────────────────────
// Sale cuando el PDF del pedido cambió en el share y nadie lo ha dado por visto
// todavía (`Pedido.scanCambiado`, que pone getTablero leyendo lo que dejó el
// vigilante).
//
// ES DEL PEDIDO, NO DE CADA PERSONA: quien pulsa "Ya lo he visto" lo apaga para
// todo el equipo. Eso es lo acordado — el que mira el parte nuevo lo mira por
// los demás— y por eso el botón no manda operario.
//
// El aviso se apaga; lo que NO se va es la nota que el vigilante dejó en el
// hilo con la fecha del escaneo. Ese es el registro permanente: dentro de tres
// meses, en el Historial, seguirá diciendo que este pedido se re-escaneó.

export function AvisoParteNuevo({
  pedido,
}: {
  /** CÓDIGO del pedido. */
  pedido: string;
}) {
  const [apagando, setApagando] = useState(false);
  // Optimista: al pulsar desaparece en el acto. El tablero tarda hasta 30 s en
  // dar la siguiente vuelta y dejar el aviso puesto todo ese rato parecería que
  // el botón no ha hecho nada.
  const [apagado, setApagado] = useState(false);
  const [error, setError] = useState(false);

  if (apagado) return null;

  async function marcar() {
    setApagando(true);
    setError(false);
    try {
      const r = await fetch("/api/pedido-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setApagado(true);
    } catch {
      // Se vuelve atrás: si no, el aviso quedaría apagado en esta pantalla y
      // encendido para todos los demás, que es la peor de las dos mentiras.
      setError(true);
    } finally {
      setApagando(false);
    }
  }

  return (
    <div className="mb-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3">
      <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">
        Han vuelto a escanear el parte
      </p>
      {/* Dice lo que sabe y no más: el mtime cambia también si alguien re-sube
          el mismo fichero, así que no se puede afirmar que el pedido haya
          cambiado. Ver el comentario de cabecera de lib/pedido-scan.ts. */}
      <p className="mt-0.5 text-[11px] leading-snug text-text-muted">
        Puede traer cambios. Míralo antes de seguir; la fecha exacta queda apuntada
        en las notas.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void marcar()}
          disabled={apagando}
          className="rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {apagando ? "Guardando…" : "Ya lo he visto"}
        </button>
        <span className="text-[10px] text-text-muted">Lo apaga para todo el equipo</span>
      </div>
      {error && (
        <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400" role="alert">
          No se pudo guardar. Comprueba la conexión.
        </p>
      )}
    </div>
  );
}
