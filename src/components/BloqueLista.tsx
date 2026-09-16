import type { ReactNode } from "react";

// ─── El contenedor de una lista ──────────────────────────────────────────────
// La tarjeta con relieve del Historial, con DOS cosas fuera de ella:
//
//   · El RÓTULO, cuando lo hay. Es el nombre del bloque ("Por revisar", un
//     día), no una fila más de la lista: dentro se leía como el encabezado de
//     la primera fila y el corte entre bloques había que buscarlo.
//   · La CABECERA DE COLUMNAS. Va encima, sobre el fondo, y con la misma
//     rejilla que las filas: así cada rótulo cae justo sobre su columna.
//
// `columnas` llega literal y se reparte a los dos sitios. Es la misma clase o
// no cae nada donde debe: por eso la recibe el bloque y no cada fila por su
// cuenta.

export function BloqueLista({
  columnas,
  cabecera,
  rotulo,
  children,
}: {
  columnas: string;
  /** Los rótulos de columna, uno por celda de la rejilla. */
  cabecera?: ReactNode;
  /** El nombre del bloque, sobre el fondo. `color` para un color calculado
   *  (el de una fase); `claseDot` para uno de los tokens de ESTADO. */
  rotulo?: { texto: string; color?: string; claseDot?: string; sufijo?: ReactNode };
  children: ReactNode;
}) {
  return (
    <div>
      {rotulo && (
        <h3 className="mb-1 flex items-center gap-2 px-3 text-[11px] font-semibold text-text">
          <span
            aria-hidden="true"
            className={`size-2 shrink-0 rounded-full ${rotulo.claseDot ?? ""}`}
            style={rotulo.color ? { background: rotulo.color } : undefined}
          />
          {rotulo.texto}
          {rotulo.sufijo && <span className="font-normal text-text-muted">{rotulo.sufijo}</span>}
        </h3>
      )}
      {cabecera && (
        <div
          aria-hidden="true"
          className={`${columnas} px-3 pb-1 text-[11px] font-semibold text-text-muted`}
        >
          {cabecera}
        </div>
      )}
      <div className="bloque-3d overflow-hidden rounded-xl">{children}</div>
    </div>
  );
}
