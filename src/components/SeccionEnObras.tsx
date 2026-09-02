"use client";

import { SECCIONES, type Seccion, type SeccionId } from "@/lib/secciones";

// ─── Una sección anunciada pero todavía no abierta ───────────────────────────
// Diseño Gráfico entró en la web antes de que su lista fuera de fiar: salía
// trabajo que no era el suyo y faltaba el que sí. Enseñar eso es peor que no
// enseñar nada — el equipo aprende a no fiarse de la lista, y de eso no se
// vuelve con un despliegue.
//
// Así que mientras se termina, la sección se ANUNCIA y no enseña nada. Decirlo
// es mejor que esconderla: quien la vio funcionando un día y ya no la encuentra
// piensa que se ha roto, y quien no sabía que venía se entera aquí.
//
// No lleva ninguna cifra ni ningún pedido a propósito. Un "42 pendientes" en
// esta pantalla sería un dato que nadie ha comprobado.

export function SeccionEnObras({
  seccion,
  onVolver,
}: {
  seccion: Seccion;
  /** A dónde se sale de aquí. Sin esto, quien entre se queda encerrado: el
   *  conmutador de secciones vive en la cabecera del tablero, que aquí no
   *  está. */
  onVolver: (s: SeccionId) => void;
}) {
  const otras = Object.values(SECCIONES).filter((s) => s.id !== seccion.id && !s.enObras);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="glass-card w-full max-w-lg rounded-2xl p-8 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-500">
          Próximamente
        </p>
        <h1 className="mt-2 text-2xl font-bold text-text">{seccion.nombre}</h1>
        <p className="mt-4 text-sm leading-relaxed text-text-muted">
          Es lo siguiente que entra en CoordinaOT. Todavía no está lista, así que
          de momento no enseña trabajo: preferimos que no haya lista a que haya
          una lista que no se pueda creer.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">
          Mientras tanto, el trabajo de {seccion.nombre} se sigue llevando como
          hasta ahora.
        </p>

        {otras.length > 0 && (
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {otras.map((s) => (
              <button
                key={s.id}
                onClick={() => onVolver(s.id)}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                Ir a {s.nombre}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
