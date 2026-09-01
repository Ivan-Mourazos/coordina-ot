"use client";

import { SECCIONES, type SeccionId } from "@/lib/secciones";

// ─── Qué lista de trabajo se está mirando ────────────────────────────────────
// Separa QUIÉN ERES de QUÉ MIRAS. Nació porque Ángel supervisa las dos
// secciones y pidió "dos usuarios": lo que necesitaba no era ser dos personas,
// era ver las dos listas.
//
// Dos usuarios habrían salido caros y mal. Por `operario_id` van sus fichajes,
// sus avisos vistos y su registro de acciones, así que su bandeja y su reloj
// habrían quedado partidos en dos; y `operarioDeEmpleado` traduce su código de
// RPS (146) a UNA persona, así que con dos ids la mitad de su trabajo se
// habría atribuido al equivocado.
//
// SE VE SIEMPRE Y LO USA CUALQUIERA. No hay permisos que mantener y mirar la
// lista de al lado no deja hacer nada que no se pudiera hacer ya. Cada uno
// arranca en la suya, así que quien no lo necesite ni se entera de que está.
//
// Solo aparece si hay más de una sección: con una sola, un conmutador de un
// botón es ruido que no conmuta nada.

export function SelectorSeccion({
  seccion,
  onCambiar,
}: {
  seccion: SeccionId;
  onCambiar: (s: SeccionId) => void;
}) {
  const todas = Object.values(SECCIONES);
  if (todas.length < 2) return null;

  return (
    <div
      role="group"
      aria-label="Qué lista de trabajo se mira"
      /* h-9: los mismos 36 px que el resto de la cabecera. */
      className="glass-chip flex h-9 items-center gap-0.5 rounded-lg p-0.5"
    >
      {todas.map((s) => {
        const activa = s.id === seccion;
        return (
          <button
            key={s.id}
            onClick={() => onCambiar(s.id)}
            aria-pressed={activa}
            /* El nombre entero en el `title` porque en el botón va abreviado:
               "Oficina Técnica" y "Diseño Gráfico" no caben en una cabecera que
               ya lleva buscador, avisos, tema y quién eres. */
            title={`Ver el trabajo de ${s.nombre}`}
            className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
              activa
                ? "bg-brand-500 text-white"
                : "text-text-muted hover:text-text"
            }`}
          >
            {ABREVIADO[s.id] ?? s.nombre}
          </button>
        );
      })}
    </div>
  );
}

/** Cómo se llama cada sección cuando no hay sitio. "OT" es como la llama todo
 *  el mundo en la casa; "Diseño" a secas no se confunde con nada. */
const ABREVIADO: Partial<Record<SeccionId, string>> = {
  ot: "OT",
  diseno: "Diseño",
};
