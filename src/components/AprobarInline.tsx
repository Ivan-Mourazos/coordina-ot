"use client";

import { useState } from "react";
import { SelectorOFs, useElegidas, type OFElegible } from "./SelectorOFs";

// ─── Aprobar, eligiendo cuáles ───────────────────────────────────────────────
// Aprobar era del grupo entero: con tres OF delante, el botón las aprobaba las
// tres. Devolver ya dejaba elegir, y la pareja quedaba coja — quien iba a
// devolver dos y aprobar la otra tenía que hacerlo EN ESE ORDEN, porque
// aprobando primero se llevaba por delante las dos que fallaban. Un orden
// obligatorio que no está escrito en ninguna parte es una trampa.
//
// Con una sola OF no se pregunta nada: se aprueba y ya, con su confirmación de
// siempre (la de `useConfirmacion`, que la pone quien nos usa).

export function AprobarInline({
  ofs,
  onAprobar,
  label = "Aprobar",
}: {
  ofs: readonly OFElegible[];
  onAprobar: (ofIds: string[]) => void;
  label?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [elegidas, setElegidas] = useElegidas(ofs);

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg bg-teal-500/10 p-2 ring-1 ring-teal-500/30">
      <SelectorOFs ofs={ofs} elegidas={elegidas} onCambiar={setElegidas} tono="aprobar" />

      {/* Lo que va a pasar, dicho antes de pulsar. Es el mismo texto que la
          confirmación de "aprobar" en lib/acciones.ts: la OF queda lista y el
          pedido se pasa a Producción aparte, cuando lo estén todas. */}
      <p className="mb-2 text-[11px] leading-snug text-text-muted">
        {elegidas.length === 1
          ? "Queda aprobada y vuelve a su autor como lista."
          : `Quedan aprobadas las ${elegidas.length} y vuelven a su autor como listas.`}{" "}
        El pedido se pasa a Producción aparte, cuando lo estén todas sus OF.
      </p>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => {
            onAprobar([...elegidas]);
            setAbierto(false);
          }}
          disabled={elegidas.length === 0}
          className="rounded-md bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {elegidas.length > 1 ? `Aprobar las ${elegidas.length}` : "Aprobar"}
        </button>
        <button
          onClick={() => setAbierto(false)}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-text-muted hover:text-text"
        >
          Cancelar
        </button>
        {elegidas.length === 0 && (
          <span className="text-[10px] text-text-muted">Marca al menos una OF</span>
        )}
      </div>
    </div>
  );
}
