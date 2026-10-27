"use client";

import { useId } from "react";
import { useElementoAcordeon } from "./Acordeon";
import { Desplegable } from "./Desplegable";

/** El texto de la línea del pedido de venta, plegado.
 *
 *  No usa `BloqueDesplegable` —el bloque con caja de la ficha— a propósito:
 *  esto vive DENTRO de la tarjeta de una OF, y una caja dentro de otra caja
 *  añade un marco por cada OF. Aquí basta una línea que se abre. */
export function DetalleVenta({
  texto,
  enFila = false,
}: {
  texto: string;
  /** Al lado del material, en la misma fila (la ficha del Historial): sin
   *  sangría propia. El botón NO se mueve al abrir (Iván, 27/10/2026: «según
   *  abra la descripción está en un sitio u otro»): el contenedor no hace caja
   *  (`contents`), así el botón es un elemento más de la fila y el texto, al
   *  abrirse, baja a una línea propia de ancho entero. */
  enFila?: boolean;
}) {
  const id = useId();
  const { abierto, alternar } = useElementoAcordeon("descripciones");
  return (
    <div className={enFila ? "contents" : "mt-1 px-2.5"}>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        aria-controls={id}
        className={`flex items-center gap-1.5 text-left ${enFila ? "" : "w-full"} text-[11px] font-medium text-text-muted hover:text-text`}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`size-3 shrink-0 transition-transform motion-reduce:transition-none ${abierto ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {abierto ? "Ocultar descripción" : "Descripción"}
      </button>
      <div id={id} className={enFila ? (abierto ? "basis-full" : "hidden") : undefined}>
        <Desplegable abierto={abierto}>
          <p className="mt-1 whitespace-pre-line recuadro rounded-lg px-2 py-1.5 text-[11px] leading-5 text-text">
            {texto}
          </p>
        </Desplegable>
      </div>
    </div>
  );
}
