"use client";

import { useId, useState, type ReactNode } from "react";
import { Desplegable } from "./Desplegable";

// ─── Un bloque plegado de la ficha ───────────────────────────────────────────
// La caja con rótulo y chevron que usan «Documentos de RPS», «Tareas y
// tiempos» y compañía dentro de la ficha de un pedido. Vive aquí porque la
// usan las DOS fichas —la de Pendientes y la del Historial— y hasta ahora
// cada una lo resolvía a su manera: en Pendientes el desglose de tiempos se
// abría plegado y en el Historial salía siempre desplegado, así que el mismo
// pedido se leía de dos formas según por dónde lo abrieras.

export function BloqueDesplegable({
  titulo,
  sufijo,
  abiertoDeSalida = false,
  className = "mb-4",
  children,
}: {
  titulo: string;
  /** Lo que va al final de la línea del rótulo, en gris: un total, un código. */
  sufijo?: ReactNode;
  /** Empezar abierto. Lo usa quien ya pagó la espera de traer los datos: una
   *  vez cargados, pedir otro clic para verlos es cobrarlo dos veces. */
  abiertoDeSalida?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const [abierto, setAbierto] = useState(abiertoDeSalida);
  return (
    <section
      className={`${className} rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)]`}
    >
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-controls={id}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-text"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`size-3.5 shrink-0 text-text-muted transition-transform motion-reduce:transition-none ${abierto ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {titulo}
        {sufijo !== undefined && (
          <span className="ml-auto font-mono text-[10px] font-normal text-text-muted">{sufijo}</span>
        )}
      </button>
      <div id={id}>
        <Desplegable abierto={abierto}>
          <div className="border-t border-[var(--glass-border)] px-3 py-3">{children}</div>
        </Desplegable>
      </div>
    </section>
  );
}
