"use client";

import type { Operario } from "@/lib/types";
import { SECCIONES, SECCION_POR_DEFECTO, type SeccionId } from "@/lib/secciones";
import { Logo } from "./Logo";

/** Pantalla de selección de técnico ("login sin login"). Se muestra cuando
 *  este navegador aún no tiene un técnico recordado en localStorage.
 *
 *  POR SECCIONES, con su rótulo encima. Desde que Diseño Gráfico entró aquí,
 *  una rejilla de nueve caras seguidas no dice de qué equipo es cada una, y la
 *  sección no es un adorno: de ella sale la lista de trabajo que se va a ver al
 *  entrar. Quien se equivoque de nombre se lleva el tablero de otro
 *  departamento sin entender por qué. */
export function IdentityGate({
  operarios,
  onSelect,
}: {
  operarios: Operario[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="w-full max-w-xl text-center">
        <div className="mb-6 flex justify-center">
          <Logo height={110} />
        </div>
        <h1 className="mb-1 text-lg font-semibold text-text">¿Quién eres?</h1>
        <p className="mb-6 text-sm text-text-muted">
          Elige tu nombre para ver tu zona y tus avisos. Se recuerda en este navegador.
        </p>
        <div className="flex flex-col gap-5">
          {porSeccion(operarios).map(([seccion, suyos]) => (
            <section key={seccion}>
              <h2 className="mb-2 border-b border-border pb-1 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                {SECCIONES[seccion].nombre}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {suyos.map((op) => (
                  <button
                    key={op.id}
                    onClick={() => onSelect(op.id)}
                    className="glass-panel flex flex-col items-center gap-2 rounded-2xl p-4 transition-all hover:scale-[1.03] hover:border-brand-400"
                  >
                    <span
                      className="grid size-14 place-items-center rounded-full text-lg font-bold text-white shadow"
                      style={{ background: op.color }}
                    >
                      {op.iniciales}
                    </span>
                    <span className="text-sm font-semibold text-text">{op.nombre}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Agrupa por sección conservando el orden de `SECCIONES`, y deja fuera las
 *  que no tengan a nadie: un rótulo sobre una rejilla vacía solo hace pensar
 *  que falta gente por cargar.
 *
 *  Se exporta para que la cabecera agrupe exactamente igual (ver
 *  IdentityBadge): dos criterios distintos para la misma lista acabarían
 *  enseñando a la misma persona en dos equipos según dónde se mire. */
export function porSeccion(operarios: readonly Operario[]): [SeccionId, Operario[]][] {
  return (Object.keys(SECCIONES) as SeccionId[])
    .map(
      (id) =>
        [id, operarios.filter((o) => (o.seccion ?? SECCION_POR_DEFECTO) === id)] as [
          SeccionId,
          Operario[],
        ],
    )
    .filter(([, suyos]) => suyos.length > 0);
}
