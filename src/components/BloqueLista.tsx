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
  desbordaHorizontal = false,
  fondoSolido = false,
  nivelRotulo: Rotulo = "h3",
}: {
  columnas: string;
  /** Los rótulos de columna, uno por celda de la rejilla. */
  cabecera?: ReactNode;
  /** El nombre del bloque, sobre el fondo. `color` para un color calculado
   *  (el de una fase); `claseDot` para uno de los tokens de ESTADO. */
  rotulo?: { texto: string; color?: string; claseDot?: string; sufijo?: ReactNode };
  children: ReactNode;
  /** SOLO Pendientes. Su columna del recorrido lleva un suelo en px
   *  (`minmax(440px, 42%)`): por debajo de ese ancho, cada FILA ya se sale de
   *  su caja —el suelo del `minmax` no cede— y esa fecha de más a la derecha,
   *  con el chip de retraso, cae fuera de los 100% de ancho que la fila tiene
   *  asignados. Eso es lo que había ANTES de este trabajo, y se veía —las
   *  fechas se pisaban, pero seguían ahí—.
   *
   *  El problema es que esta caja llevaba `overflow-hidden`: RECORTA ese
   *  sobrante en vez de dejarlo desbordar, así que ni con scroll se vuelve a
   *  ver. Con esta prop se deja de recortar (nada de `overflow-hidden`) y es
   *  el `overflow-x-auto` de quien envuelve el bloque entero —cabecera y
   *  caja, ver ListaView— el que ofrece la barra para llegar hasta el final:
   *  detecta el sobrante de cada fila en cuanto nada por el camino se lo
   *  esconde.
   *
   *  NO sirve para las otras tres vistas: sus columnas reparten con
   *  `minmax(0,1fr)`, que SÍ cede, así que nunca desbordan — y quitarles el
   *  recorte sin necesidad solo arriesga la esquina redondeada de la primera
   *  y la última fila (ver más abajo). */
  desbordaHorizontal?: boolean;
  /** Para bloques que descansan DIRECTAMENTE sobre el fondo de la página, sin
   *  panel ni telón alrededor (las Visitas): el vidrio translúcido de
   *  `bloque-3d` se mezclaba con el gris del fondo, sobre todo en tema claro,
   *  y el bloque no se leía como una tarjeta. `panel-solido` es opaco. */
  fondoSolido?: boolean;
  /** Nivel del encabezado del rótulo. `h3` por defecto porque el Historial
   *  cuelga de un `h1` con un `h2` de sección por medio; Revisiones no tiene
   *  ese `h2` intermedio y pide `h2` directamente para no saltarse un nivel. */
  nivelRotulo?: "h2" | "h3";
}) {
  return (
    <div>
      {rotulo && (
        <Rotulo className="mb-1 px-3 text-[11px] font-semibold text-text">
          {/* El punto SOLO si hay color. Sin él no se pinta un círculo
              transparente que ocupa sitio: los días del Historial llevan
              rótulo pero no color, y les salía un punto gris de la nada.
              `align-middle` y no un `flex` con `self-center`: probado en el
              navegador, un `<span>` sin texto dentro de una fila flex no
              tiene línea base propia, y el navegador se la inventa por el
              borde inferior — el punto queda centrado sobre TODA la caja de
              línea (con su interlineado) en vez de sobre la palabra, y se ve
              flotando por encima de "Hoy". `vertical-align: middle` es el
              mecanismo pensado para esto: centra contra la línea base más
              medio "ex", que es donde cae el centro óptico de un texto corto.
              Solo actúa en contenido en línea, así que el rótulo entero deja
              de ser una fila flex y pasa a fluir como texto normal — el
              título y el sufijo siguen compartiendo línea base porque eso ya
              lo hace el flujo en línea por defecto, sin pedirlo. */}
          {(rotulo.color || rotulo.claseDot) && (
            <span
              aria-hidden="true"
              className={`mr-2 inline-block size-2 rounded-full align-middle ${rotulo.claseDot ?? ""}`}
              style={rotulo.color ? { background: rotulo.color } : undefined}
            />
          )}
          {rotulo.texto}
          {rotulo.sufijo && <span className="ml-2 font-normal text-text-muted">{rotulo.sufijo}</span>}
        </Rotulo>
      )}
      {cabecera && (
        <div
          aria-hidden="true"
          className={`${columnas} px-3 pb-1 text-[11px] font-semibold text-text-muted`}
        >
          {cabecera}
        </div>
      )}
      <div
        className={[
          fondoSolido ? "panel-solido" : "bloque-3d",
          // Sin `overflow-hidden` cuando `desbordaHorizontal`: es justo lo que
          // había que quitar (ver el comentario de la prop). La esquina
          // redondeada de la caja no depende de esto —es el borde y el fondo
          // de la propia caja—; lo único que se pierde es que el fondo de una
          // fila abierta o con el ratón encima podría asomar en ángulo recto
          // por la esquina de la primera o la última fila, un matiz menor
          // frente a perder fechas enteras.
          desbordaHorizontal ? null : "overflow-hidden",
          "rounded-xl",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    </div>
  );
}
