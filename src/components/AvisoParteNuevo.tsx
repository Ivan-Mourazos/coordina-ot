"use client";

import { useState } from "react";
import { useSoloLectura } from "./SoloLectura";

// ─── "Han vuelto a escanear el parte" ────────────────────────────────────────
// Sale cuando el PDF del pedido cambió en el share y nadie lo ha dado por visto
// todavía (`Pedido.scanCambiado`, que pone getTablero leyendo lo que dejó el
// vigilante).
//
// ESTE DISTINTIVO ES DEL PEDIDO, NO DE CADA PERSONA: quien pulsa "Ya lo he
// visto" lo apaga para todo el equipo —el que mira el parte nuevo lo mira por
// los demás— y por eso el botón no manda operario. Lo personal es el aviso de
// la campana: ese solo le suena a quien lleva el pedido y cada uno lo quita de
// la suya (ver `avisaParteNuevo` en lib/notificaciones.ts).
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
  const soloLectura = useSoloLectura();
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
    // Placa del mismo acabado que los bloques de la ficha, con una raya ámbar
    // SÓLIDA que dice «aviso». El fondo ámbar translúcido de antes salía crema
    // en claro, que es justo lo que Iván no quiere (15/10/2026).
    <div className="bloque-3d relative mb-3 overflow-hidden rounded-xl p-3 pl-4">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-amber-600 dark:bg-amber-400" />
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
      {!soloLectura && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void marcar()}
            disabled={apagando}
            className="boton-3d rounded-lg bg-amber-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
          >
            {apagando ? "Guardando…" : "Ya lo he visto"}
          </button>
          <span className="text-[10px] text-text-muted">Quita la marca del pedido a todo el equipo</span>
        </div>
      )}
      {error && (
        <p className="mt-1.5 text-[11px] text-error" role="alert">
          No se pudo guardar. Comprueba la conexión.
        </p>
      )}
    </div>
  );
}
