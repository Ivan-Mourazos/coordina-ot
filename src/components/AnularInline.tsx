"use client";

import { useState } from "react";
import { CAUSAS, anulacionCompleta, codificarAnulacion, type CausaAnulacion } from "@/lib/anulacion";

/** Anular preguntando POR QUÉ, ahí mismo.
 *
 *  Antes era un sí/no y la OF quedaba anulada sin más: al repasar las anuladas
 *  no había forma de saber si la hizo el taller, si la mandaron fuera o si se
 *  cayó el pedido entero. Elegir la causa ES la confirmación —un diálogo de
 *  sí/no encima sería preguntar dos veces— y además deja el motivo escrito
 *  donde se lee sin abrir nada (el propio distintivo: "ANULADA · TALLER").
 *
 *  Mismo patrón que `DevolverInline`, y por lo mismo: el botón de llamada va
 *  discreto y el rojo sólido se reserva para el punto de no retorno. */
export function AnularInline({
  onAnular,
  abierto: abiertoFuera,
  onAbrirCambio,
}: {
  onAnular: (obs: string) => void;
  /** Modo CONTROLADO: quien lo monta decide si está abierto.
   *
   *  Existe para poder llamarlo desde el menú de "⋯" de la OF, donde el botón
   *  de anular ya vive como opción del menú: sin esto, el componente pintaba
   *  ADEMÁS su propio botón y salía dos veces. Sin la prop se comporta como
   *  siempre y trae su botón. */
  abierto?: boolean;
  onAbrirCambio?: (v: boolean) => void;
}) {
  const [abiertoPropio, setAbiertoPropio] = useState(false);
  const controlado = abiertoFuera !== undefined;
  const abierto = controlado ? abiertoFuera : abiertoPropio;
  const cerrar = () => (controlado ? onAbrirCambio?.(false) : setAbiertoPropio(false));
  const [causa, setCausa] = useState<CausaAnulacion | null>(null);
  const [nota, setNota] = useState("");

  if (!abierto) {
    // Controlado y cerrado: no pinta nada. Su botón es la opción del menú.
    if (controlado) return null;
    return (
      <button
        onClick={() => setAbiertoPropio(true)}
        className="ml-auto rounded-lg px-2.5 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-500/35 hover:bg-red-500/10 dark:text-red-400"
      >
        Anular OF
      </button>
    );
  }

  const elegida = causa ? { causa, nota } : null;
  const pideNota = CAUSAS.find((c) => c.id === causa)?.pideNota;

  return (
    <div className="w-full rounded-lg bg-red-500/10 p-2 ring-1 ring-red-500/30">
      <p className="mb-1.5 text-[11px] font-semibold text-text">
        ¿Por qué no la hace Oficina Técnica?
      </p>
      <div className="flex flex-wrap gap-1.5">
        {CAUSAS.map((c) => (
          <button
            key={c.id}
            onClick={() => setCausa(c.id)}
            aria-pressed={causa === c.id}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${
              causa === c.id
                ? "bg-red-600 text-white ring-transparent"
                : "text-text-muted ring-border hover:text-text"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {pideNota && (
        <textarea
          autoFocus
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") cerrar();
          }}
          placeholder="¿Cuál es el motivo?"
          rows={2}
          className="mt-1.5 w-full resize-none rounded-md bg-surface px-2 py-1.5 text-xs text-text outline-none ring-1 ring-border placeholder:text-text-muted focus:ring-red-400"
        />
      )}

      <p className="mt-1.5 text-[10px] leading-snug text-text-muted">
        Deja de contar para dar el pedido por hecho. El tiempo ya fichado se
        conserva, y se puede restaurar.
      </p>
      <div className="mt-1.5 flex gap-1.5">
        <button
          onClick={() => elegida && onAnular(codificarAnulacion(elegida))}
          disabled={!elegida || !anulacionCompleta(elegida)}
          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Anular OF
        </button>
        <button
          onClick={() => cerrar()}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-text-muted hover:text-text"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
