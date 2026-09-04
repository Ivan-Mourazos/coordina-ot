"use client";

// ─── "Hay una versión nueva de la web" ───────────────────────────────────────
// Una pestaña que lleva abierta desde antes del despliegue sigue con el código
// viejo hasta que alguien recargue a mano, y aquí eso pasa: la web se deja
// abierta toda la jornada. Con Next hay además un efecto peor que quedarse sin
// lo nuevo — los trozos de JavaScript de la versión anterior dejan de existir
// en el servidor, así que al abrir una pantalla que no estaba cargada todavía
// puede salir un error en vez de la pantalla.
//
// SE AVISA, NO SE RECARGA SOLA. Recargar por su cuenta se llevaría por delante
// la nota a medio escribir o el cuadro de devolución abierto, y una pantalla
// que se reinicia sola mientras trabajas asusta más de lo que ayuda. El aviso
// es una barra discreta abajo; quien no le haga caso sigue con la versión de
// antes, que es lo que hacía hasta hoy.
//
// La versión la trae la respuesta del tablero (cabecera `X-Coordina-Version`),
// así que esto no pide nada por su cuenta: el Board ya pregunta cada 30 s.

export function VersionNueva({ onRecargar }: { onRecargar?: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[95] flex justify-center p-3">
      <div className="glass-pop flex items-center gap-3 rounded-xl px-3 py-2 shadow-lg">
        <span className="text-sm text-text">
          <span className="font-semibold">Hay una versión nueva de la web.</span>{" "}
          <span className="text-text-muted">
            Actualiza cuando puedas; no pierdes nada de lo que estés haciendo.
          </span>
        </span>
        <button
          onClick={() => (onRecargar ? onRecargar() : window.location.reload())}
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Actualizar
        </button>
      </div>
    </div>
  );
}
