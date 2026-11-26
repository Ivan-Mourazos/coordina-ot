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
// Desde el 26/11/2026 ya no lo ve cualquiera (Iván): casi nadie lo usaba y
// ocupaba el sitio de lo diario en el menú. Lo ve quien trabaja en varias
// secciones (solo las suyas, `solo`) y, completo, Administración —supervisores
// como Ángel y Dirección—. Sigue sin ser un permiso: mirar la lista de al lado
// no deja hacer nada que no se pudiera hacer ya.
//
// Solo aparece si hay más de una sección: con una sola, un conmutador de un
// botón es ruido que no conmuta nada.

export function SelectorSeccion({
  seccion,
  onCambiar,
  solo,
}: {
  seccion: SeccionId;
  onCambiar: (s: SeccionId) => void;
  /** Solo estas secciones (las de quien trabaja en varias). Sin él, todas. */
  solo?: readonly SeccionId[];
}) {
  const todas = Object.values(SECCIONES).filter((s) => !solo || solo.includes(s.id));
  if (todas.length < 2) return null;

  return (
    <div
      role="group"
      aria-label="Qué lista de trabajo se mira"
      /* h-9: los mismos 36 px que el resto de la cabecera. */
      className="tira-3d glass-chip flex h-9 items-center gap-0.5 rounded-lg p-0.5"
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
            title={
              s.enObras
                ? `${s.nombre} todavía no está lista: se puede ver el anuncio, pero no enseña trabajo`
                : `Ver el trabajo de ${s.nombre}`
            }
            className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
              activa
                ? "pestana-activa"
                : "text-text-muted hover:text-text"
            }`}
          >
            {s.nombreCorto}
            {/* Un punto y ya: dice que ahí todavía no hay trabajo que mirar,
                sin robarle sitio a una cabecera que va justa. Lo que hay
                detrás lo cuenta el `title`, y la pantalla entera si se
                pulsa. */}
            {s.enObras && (
              <span
                aria-label="todavía no está lista"
                className="ml-1 inline-block size-1.5 rounded-full bg-amber-500 align-middle"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

