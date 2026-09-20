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
  insignia,
  sufijo,
  abiertoDeSalida = false,
  onAbrir,
  className = "mb-4",
  children,
}: {
  titulo: string;
  /** Un contador pegado al rótulo ("Documentos de RPS · 3"). */
  insignia?: ReactNode;
  /** Lo que va al final de la línea del rótulo, en gris: un total, un código. */
  sufijo?: ReactNode;
  /** Empezar abierto. Lo usa quien ya pagó la espera de traer los datos: una
   *  vez cargados, pedir otro clic para verlos es cobrarlo dos veces. */
  abiertoDeSalida?: boolean;
  /** Se avisa la primera vez que se abre: lo usa quien pide sus datos al
   *  desplegar y no al montar (los documentos de RPS). */
  onAbrir?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const [abierto, setAbierto] = useState(abiertoDeSalida);
  return (
    // `bloque-3d`: el mismo relieve que las tarjetas de OF y las filas de las
    // listas. Los bloques de la ficha llevaban dos acabados —unos con relieve
    // y otros con un borde plano— y "Documentos de RPS" y "Tareas y tiempos",
    // uno encima del otro, no parecían el mismo tipo de bloque.
    <section className={`bloque-3d ${className} rounded-xl`}>
      <button
        type="button"
        onClick={() => {
          const nuevo = !abierto;
          setAbierto(nuevo);
          if (nuevo) onAbrir?.();
        }}
        aria-expanded={abierto}
        aria-controls={id}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted"
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
        {insignia}
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
