"use client";

import { useState } from "react";

/** Una OF que está a punto de recibir una acción. */
export interface OFElegible {
  id: string;
  codigo: string;
}

// ─── A cuáles va lo que estás haciendo ───────────────────────────────────────
// Aprobar y devolver eran acciones DEL GRUPO: se pulsaba una vez y caía sobre
// todas las OF del pedido. En un pedido de cinco con una lona mal, eso son
// cuatro personas leyendo que corrijan algo que está bien —o cuatro OF
// aprobadas de un plumazo cuando una no lo estaba.
//
// Vive aparte porque lo usan los dos, y tienen que verse y comportarse igual:
// si en un sitio se eligen OF con casillas y en el otro con otra cosa, hay que
// aprender dos.

export function SelectorOFs({
  ofs,
  elegidas,
  onCambiar,
  tono,
}: {
  ofs: readonly OFElegible[];
  elegidas: readonly string[];
  onCambiar: (ids: string[]) => void;
  /** El color de lo que se va a hacer, el mismo de la acción: rojo para
   *  devolver, verde azulado para aprobar. Sin esto, un cuadro rojo con las OF
   *  marcadas en rojo diría "devolver" en medio de una aprobación. */
  tono: "devolver" | "aprobar";
}) {
  if (ofs.length <= 1) return null;

  const marcada = tono === "devolver" ? "bg-red-600" : "bg-teal-600";
  return (
    <div className="mb-2">
      <p className="mb-1 text-[11px] font-semibold text-text">
        {tono === "devolver" ? "¿Qué vuelve?" : "¿Qué se aprueba?"}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {ofs.map((o) => {
          const puesta = elegidas.includes(o.id);
          return (
            <button
              key={o.id}
              onClick={() =>
                onCambiar(
                  puesta ? elegidas.filter((x) => x !== o.id) : [...elegidas, o.id],
                )
              }
              aria-pressed={puesta}
              className={`rounded-md px-2 py-1 font-mono text-[11px] font-semibold ring-1 ${
                puesta
                  ? `${marcada} text-white ring-transparent`
                  : "text-text-muted ring-border hover:text-text"
              }`}
            >
              {o.codigo}
            </button>
          );
        })}
        {elegidas.length !== ofs.length && (
          <button
            onClick={() => onCambiar(ofs.map((o) => o.id))}
            className="text-[10px] font-semibold text-text-muted underline underline-offset-2 hover:text-text"
          >
            todas
          </button>
        )}
      </div>
    </div>
  );
}

/** Qué OF quedan marcadas cuando la lista de elegibles cambia bajo los pies.
 *
 *  Pasa al encadenar acciones: se devuelve una, esa sale de revisión y
 *  desaparece de la lista. Sin podar, quedaría marcada una OF que ya no está y
 *  el siguiente botón no haría nada. Y si no queda ninguna marcada, se marcan
 *  todas las que quedan, que es donde sigue el trabajo. */
export function useElegidas(ofs: readonly OFElegible[]) {
  const [elegidas, setElegidas] = useState<string[]>(() => ofs.map((o) => o.id));

  // Durante el render y no en un efecto: React descarta este render y repite
  // con el valor bueno, así que no se llega a pintar el estado intermedio.
  const idsActuales = ofs.map((o) => o.id).join("|");
  const [idsPrevios, setIdsPrevios] = useState(idsActuales);
  if (idsActuales !== idsPrevios) {
    setIdsPrevios(idsActuales);
    const vivas = elegidas.filter((id) => ofs.some((o) => o.id === id));
    setElegidas(vivas.length > 0 ? vivas : ofs.map((o) => o.id));
  }

  return [elegidas, setElegidas] as const;
}
