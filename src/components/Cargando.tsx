/** Lo que se ve mientras llegan los datos (Iván, 18/11/2026: «que salga una
 *  animación cuando entramos en Métricas y se están cargando, y en las
 *  pestañas, sin ser muy grande»).
 *
 *  Esqueletos con la forma de lo que va a llegar, en vez de un «Cargando…»
 *  suelto: la pantalla no cambia de tamaño al llegar los datos, y el brillo
 *  que pasa dice que algo está en marcha. Si la respuesta tarda menos de
 *  ~250 ms no se llega a ver (lo retrasa `.esqueleto-retrasado` en
 *  transiciones.css), así que en las cargas rápidas no parpadea. */

/** Una barra o bloque de esqueleto. La forma la da `className`. */
export function Esqueleto({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`esqueleto block ${className}`} />;
}

/** Filas de una lista mientras se carga: un rótulo corto y un texto largo,
 *  con anchos distintos para que no parezca una rejilla. */
export function CargandoFilas({ etiqueta, filas = 4, className = "" }: { etiqueta: string; filas?: number; className?: string }) {
  const anchos = ["w-2/3", "w-1/2", "w-3/4", "w-2/5", "w-3/5"];
  return (
    <div role="status" className={`esqueleto-retrasado flex flex-col gap-1.5 ${className}`}>
      <span className="sr-only">{etiqueta}</span>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} aria-hidden="true" className="flex items-center gap-3 rounded-xl bg-surface/60 px-3 py-2.5">
          <Esqueleto className="h-3 w-20 shrink-0 rounded" />
          <Esqueleto className={`h-3 rounded ${anchos[i % anchos.length]}`} />
          <Esqueleto className="ml-auto h-3 w-12 shrink-0 rounded" />
        </div>
      ))}
    </div>
  );
}
